const { createHmac, timingSafeEqual } = require('node:crypto');

const FASTGPT_URL = 'https://cloud.fastgpt.io/api/v1/chat/completions';
const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const FALLBACK_REPLY = '抱歉，暫時無法回覆，請稍後再試。';

function validSignature(body, signature, secret) {
  if (typeof signature !== 'string') return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  const actual = Buffer.from(signature, 'base64');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function replyToEvent(event, config) {
  if (event.type !== 'message' || event.message?.type !== 'text' || !event.replyToken) return;
  const source = event.source;
  const chatId = [source?.type, source?.groupId ?? source?.roomId, source?.userId]
    .filter(Boolean).join(':');

  let reply = FALLBACK_REPLY;
  try {
    const response = await fetch(FASTGPT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.FASTGPT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        appId: config.FASTGPT_APP_ID,
        chatId: source?.userId ? chatId : undefined,
        stream: false,
        detail: false,
        messages: [{ role: 'user', content: event.message.text }],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (response.ok) {
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content === 'string' && content.trim()) {
        reply = content;
      } else {
        console.error('FastGPT returned no reply text');
      }
    } else {
      console.error(`FastGPT HTTP ${response.status}`);
    }
  } catch (error) {
    if (error?.name === 'TimeoutError') {
      console.error('FastGPT request timed out');
    } else if (error instanceof SyntaxError) {
      console.error('FastGPT returned invalid JSON');
    } else {
      console.error('FastGPT connection failed');
    }
  }

  const response = await fetch(LINE_REPLY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.LINE_CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: reply.slice(0, 5000).replace(/[\uD800-\uDBFF]$/, '') }],
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`LINE Reply HTTP ${response.status}`);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method not allowed');
  }

  const config = process.env;
  if (!config.LINE_CHANNEL_SECRET) return res.status(500).send('Webhook is not configured');

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  if (!validSignature(body, req.headers['x-line-signature'], config.LINE_CHANNEL_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  let events;
  try {
    ({ events } = JSON.parse(body.toString('utf8')));
    if (!Array.isArray(events)) return res.status(400).send('Invalid events');
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  if (events.length && (!config.LINE_CHANNEL_ACCESS_TOKEN ||
      !config.FASTGPT_API_KEY || !config.FASTGPT_APP_ID)) {
    return res.status(500).send('Webhook is not configured');
  }

  const results = await Promise.allSettled(events.map(event => replyToEvent(event, config)));
  if (results.some(result => result.status === 'rejected')) {
    console.error('LINE reply failed');
    return res.status(502).send('Reply failed');
  }
  return res.status(200).send('OK');
};
