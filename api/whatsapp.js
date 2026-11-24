const { createHash } = require('node:crypto');
const { waitUntil } = require('@vercel/functions');
const { validateRequest } = require('twilio');
const { getFastGPTReply } = require('../lib/fastgpt');

const WEBHOOK_URL = 'https://fastgpt-line-admi.vercel.app/api/whatsapp';
const WHATSAPP_ADDRESS = /^whatsapp:\+[1-9]\d{1,14}$/;

async function replyToMessage({ AccountSid, From, To, Body }, config) {
  const chatId = 'whatsapp:' + createHash('sha256').update(`${To}:${From}`).digest('hex');
  const reply = await getFastGPTReply(Body.trim(), chatId, config);
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${AccountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${AccountSid}:${config.TWILIO_AUTH_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      From: To,
      To: From,
      Body: reply.slice(0, 1600).replace(/[\uD800-\uDBFF]$/, ''),
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) console.error(`Twilio WhatsApp reply HTTP ${response.status}`);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method not allowed');
  }

  const config = process.env;
  if (!config.TWILIO_AUTH_TOKEN || !config.FASTGPT_API_KEY || !config.FASTGPT_APP_ID) {
    return res.status(503).send('Webhook is not configured');
  }
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') {
    return res.status(415).send('Expected form data');
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  const params = Object.fromEntries(
    [...new Set(form.keys())].map(key => {
      const values = form.getAll(key);
      return [key, values.length === 1 ? values[0] : values];
    }),
  );
  const signature = req.headers['x-twilio-signature'];
  if (typeof signature !== 'string' || !validateRequest(config.TWILIO_AUTH_TOKEN, signature, WEBHOOK_URL, params)) {
    return res.status(403).send('Invalid signature');
  }

  if (/^AC[0-9a-f]{32}$/i.test(params.AccountSid) &&
      WHATSAPP_ADDRESS.test(params.From) && WHATSAPP_ADDRESS.test(params.To) &&
      typeof params.Body === 'string' && params.Body.trim()) {
    waitUntil(replyToMessage(params, config).catch(() => console.error('Twilio WhatsApp reply failed')));
  }

  return res.status(200).setHeader('Content-Type', 'text/xml; charset=utf-8').send('<Response/>');
};
