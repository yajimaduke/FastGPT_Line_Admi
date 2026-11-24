
const { createHash } = require('node:crypto');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST' || Date.now() > 1795515924659 ||
      createHash('sha256').update(String(req.headers.authorization || '').replace(/^Bearer /, '')).digest('hex') !== 'f606e1de0fa34d943b0ea00f7baf4b9c57a3d965a073aa5f62580419b9e223a8') {
    return res.status(404).send('Not found');
  }
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET } = process.env;
  try {
    const endpoint = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN;
    const url = 'https://fastgpt-line-admi.vercel.app/api/telegram';
    const result = await fetch(endpoint + '/setWebhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({url,secret_token:TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message']}),
      signal: AbortSignal.timeout(8000),
    });
    if (!result.ok || !(await result.json()).ok) {
      return res.status(502).json({ registered:false, telegramStatus:result.status });
    }
    const info = await fetch(endpoint + '/getWebhookInfo', { signal:AbortSignal.timeout(4000) });
    const data = await info.json();
    return res.status(200).json({ registered:true, verified:data.result?.url === url });
  } catch {
    return res.status(502).json({ registered:false });
  }
};
