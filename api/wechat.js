const { createHash, timingSafeEqual } = require('node:crypto');
const { waitUntil } = require('@vercel/functions');
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const { getFastGPTReply } = require('../lib/fastgpt');

const api = 'https://api.weixin.qq.com/cgi-bin';
const parser = new XMLParser({ parseTagValue: false });
let cachedToken;
let tokenRequest;

async function getAccessToken(config) {
  if (cachedToken?.expiresAt > Date.now()) return cachedToken.value;
  tokenRequest ??= (async () => {
    const response = await fetch(api + '/stable_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credential',
        appid: config.WECHAT_APP_ID,
        secret: config.WECHAT_APP_SECRET,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    if (!response.ok || !data.access_token) {
      throw new Error(`WeChat token failed (${Number(data.errcode) || response.status})`);
    }
    cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
    return cachedToken.value;
  })().finally(() => { tokenRequest = undefined; });
  return tokenRequest;
}

async function sendReply(message, config) {
  const user = message.FromUserName;
  const chatId = 'wechat-oa:' + createHash('sha256').update(JSON.stringify([config.WECHAT_APP_ID, user])).digest('hex');
  const [reply, token] = await Promise.all([
    getFastGPTReply(message.Content.trim(), chatId, config),
    getAccessToken(config),
  ]);
  const response = await fetch(api + '/message/custom/send?' + new URLSearchParams({ access_token: token }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      touser: user,
      msgtype: 'text',
      text: { content: [...reply].slice(0, 600).join('') },
    }),
    signal: AbortSignal.timeout(5000),
  });
  const data = await response.json();
  if (!response.ok || data.errcode !== 0) {
    throw new Error(`WeChat reply failed (${Number(data.errcode) || response.status})`);
  }
  console.info('WeChat accepted the reply');
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).send('Method not allowed');
  }
  const config = process.env;
  if (!config.WECHAT_WEBHOOK_TOKEN) return res.status(503).send('WeChat token is not configured');

  const query = new URL(req.url, 'http://localhost').searchParams;
  const signature = query.get('signature') || '';
  const timestamp = query.get('timestamp') || '';
  const nonce = query.get('nonce') || '';
  const expected = createHash('sha1').update([config.WECHAT_WEBHOOK_TOKEN, timestamp, nonce].sort().join('')).digest();
  if (!timestamp || !nonce || !/^[0-9a-f]{40}$/i.test(signature) ||
      !timingSafeEqual(expected, Buffer.from(signature, 'hex'))) {
    console.warn('WeChat callback signature rejected');
    return res.status(403).send('Invalid signature');
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  if (req.method === 'GET') {
    console.info('WeChat verification signature accepted');
    return res.status(200).send(query.get('echostr') || '');
  }
  console.info('WeChat message callback signature accepted');

  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 64 * 1024) return res.status(413).send('Payload too large');
    chunks.push(buffer);
  }
  const xml = Buffer.concat(chunks).toString('utf8');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
    console.warn('WeChat callback contained invalid XML');
    return res.status(400).send('Invalid XML');
  }
  const message = parser.parse(xml).xml;
  if (message?.MsgType === 'text' && typeof message.FromUserName === 'string' &&
      typeof message.Content === 'string' && message.Content.trim()) {
    if (!config.WECHAT_APP_ID || !config.WECHAT_APP_SECRET || !config.FASTGPT_API_KEY || !config.FASTGPT_APP_ID) {
      console.error('WeChat reply configuration is incomplete');
      return res.status(503).send('WeChat replies are not configured');
    }
    console.info('WeChat text message queued for reply');
    waitUntil(sendReply(message, config).catch(error => {
      console.error(/^WeChat (token|reply) failed \(\d+\)$/.test(error.message)
        ? error.message : 'WeChat API request failed');
    }));
  }
  return res.status(200).send('success');
};
