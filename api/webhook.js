const { createHmac, timingSafeEqual } = require('node:crypto');
const { getFastGPTReply } = require('../lib/fastgpt');

const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';

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

  const lineText = await getFastGPTReply(event.message.text, source?.userId ? chatId : undefined, config);
  const response = await fetch(LINE_REPLY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.LINE_CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: lineText.slice(0, 5000).replace(/[\uD800-\uDBFF]$/, '') }],
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
