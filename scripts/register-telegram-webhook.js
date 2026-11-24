const { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET } = process.env;
const url = 'https://fastgpt-line-admi.vercel.app/api/telegram';

async function register() {
  if (!/^\d+:[\w-]+$/.test(TELEGRAM_BOT_TOKEN || '') ||
      !/^[A-Za-z0-9_-]{1,256}$/.test(TELEGRAM_WEBHOOK_SECRET || '')) {
    throw new Error('Set a valid TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in the environment');
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, secret_token: TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message'] }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram registration failed (HTTP ${response.status})`);
  }
  console.log(`Telegram webhook registered at ${url}`);
}

register().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
