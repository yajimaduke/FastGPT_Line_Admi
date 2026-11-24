const { execFile, spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { createInterface } = require('node:readline');
const { promisify } = require('node:util');
const { getFastGPTReply } = require('../lib/fastgpt');

const run = promisify(execFile);
const config = process.env;
const account = config.WECHAT_ACCOUNT || 'chatadmission';
const chatId = config.WECHAT_TEST_CHAT_ID;
const wxArgs = ['--json', '--account', account];
const { FASTGPT_API_KEY, ...wxEnvironment } = config;

async function wx(...args) {
  const { stdout } = await run('wx', [...wxArgs, ...args], { timeout: 45000, windowsHide: true, env: wxEnvironment });
  return JSON.parse(stdout);
}

async function main() {
  if (!chatId || chatId.endsWith('@chatroom') || !FASTGPT_API_KEY || !config.FASTGPT_APP_ID) {
    throw new Error('Set WECHAT_TEST_CHAT_ID to a private chat, plus FASTGPT_API_KEY and FASTGPT_APP_ID');
  }

  const chat = await wx('chats', 'get', chatId);
  if (chat.kind !== 'direct') {
    throw new Error('Selected chat is not recognized as a private contact');
  }

  const stream = spawn('wx', [...wxArgs, 'events', 'watch'], {
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
    env: wxEnvironment,
  });
  const stopped = new Promise(resolve => {
    stream.once('error', () => resolve(1));
    stream.once('close', resolve);
  });
  const lines = createInterface({ input: stream.stdout });
  const stop = () => stream.kill();
  process.once('SIGINT', stop);
  console.log('Waiting for a new private message beginning with AI ');
  try {
    for await (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.kind !== 'message.committed' || event.data?.threadId !== chatId ||
            event.data.origin !== 'live' || event.data.direction !== 'incoming' ||
            typeof event.data.messageId !== 'string') continue;
        const message = await wx('messages', 'get', event.data.messageId);
        if (message.threadId !== chatId || message.direction !== 'incoming' ||
            message.type !== 1 || typeof message.body !== 'string') continue;
        const question = /^AI\s+(.+)$/is.exec(message.body.trim())?.[1]?.trim();
        if (!question) continue;

        const session = createHash('sha256').update(JSON.stringify([account, chatId])).digest('hex');
        const reply = await getFastGPTReply(question, 'wechat-agent:' + session, config);
        const key = createHash('sha256').update(event.data.messageId).digest('hex');
        const result = await wx('messages', 'send', chatId, '--text=' + reply, '--idempotency-key', key);
        console.log('WeChat send state:', result.state || 'see Agent WeChat receipts');
      } catch {
        console.error('Could not process a WeChat event');
      }
    }
    if (await stopped) throw new Error('Agent WeChat event stream stopped');
  } finally {
    lines.close();
    stream.kill();
    process.removeListener('SIGINT', stop);
  }
}

main().catch(error => {
  console.error(error.message.includes('Set WECHAT') || error.message.startsWith('Selected chat')
    ? error.message : 'Could not connect to Agent WeChat. Check wx serve and the account alias.');
  process.exitCode = 1;
});
