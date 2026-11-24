const { timingSafeEqual } = require('node:crypto');
const { waitUntil } = require('@vercel/functions');
const { getFastGPTReply } = require('../lib/fastgpt');

async function replyToMessage(message, config) {
  const question = message.text.trim();
  const session = 'telegram:' + message.chat.id;
  const greeting = '你好！我是 ChatAdmission。你可以問我教大的課程或入學要求。';
  const text = /^\/start(?:\s|$)/i.test(question)
    ? greeting
    : await getFastGPTReply(question, session, config);
  const response = await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: message.chat.id,
      text: [...text].slice(0, 4096).join(''),
      link_preview_options: { is_disabled: true },
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    console.error(`Telegram reply HTTP ${response.status}`);
    return;
  }
  console.info('Telegram accepted the reply');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method not allowed');
  }

  const config = process.env;
  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_WEBHOOK_SECRET ||
      !config.FASTGPT_API_KEY || !config.FASTGPT_APP_ID) {
    return res.status(503).send('Telegram webhook is not configured');
  }

  const header = req.headers['x-telegram-bot-api-secret-token'];
  const actual = Buffer.from(typeof header === 'string' ? header : '');
  const expected = Buffer.from(config.TELEGRAM_WEBHOOK_SECRET);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return res.status(403).send('Invalid webhook secret');
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  let message;
  try {
    message = JSON.parse(Buffer.concat(chunks).toString('utf8'))?.message;
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  if (message?.chat?.type === 'private' && Number.isSafeInteger(message.chat.id) &&
      !message.from?.is_bot && typeof message.text === 'string' && message.text.trim()) {
    console.info('Telegram private text message received');
    waitUntil(replyToMessage(message, config).catch(() => console.error('Telegram reply failed')));
  }

  return res.status(200).send('OK');
};
