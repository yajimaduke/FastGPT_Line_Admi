const { execFile, spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync } = require('node:fs');
const { delimiter, join } = require('node:path');
const { createInterface } = require('node:readline');
const { promisify } = require('node:util');
const { getFastGPTReply } = require('../lib/fastgpt');

const run = promisify(execFile);
const config = process.env;
const account = config.WECHAT_ACCOUNT || 'chatadmission';
const wxArgs = ['--json', '--account', account];
const { FASTGPT_API_KEY, ...wxEnvironment } = config;

function resolveWx() {
  if (process.platform !== 'win32') return { file: 'wx', args: [] };
  for (const entry of (config.Path || config.PATH || '').split(delimiter)) {
    const directory = entry.trim().replace(/^"|"$/g, '');
    if (!directory) continue;
    const executable = join(directory, 'wx.exe');
    if (existsSync(executable)) return { file: executable, args: [] };
    const launcher = join(directory, 'node_modules', '@agent-wechat', 'cli', 'scripts', 'native-launcher.mjs');
    if (existsSync(join(directory, 'wx.cmd')) && existsSync(launcher)) {
      return { file: process.execPath, args: [launcher] };
    }
  }
  throw new Error('Agent WeChat executable was not found on PATH');
}

async function main() {
  if (!FASTGPT_API_KEY || !config.FASTGPT_APP_ID) {
    throw new Error('Set FASTGPT_API_KEY and FASTGPT_APP_ID');
  }
  const command = resolveWx();
  const argsFor = (...args) => [...command.args, ...wxArgs, ...args];
  async function wx(...args) {
    const { stdout } = await run(command.file, argsFor(...args), {
      timeout: 45000,
      windowsHide: true,
      env: wxEnvironment,
    });
    return JSON.parse(stdout);
  }

  const stream = spawn(command.file, argsFor('events', 'watch'), {
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
  console.log('Waiting for private text messages from WeChat friends');
  try {
    for await (const line of lines) {
      try {
        const event = JSON.parse(line);
        const chatId = event.data?.threadId;
        if (event.kind !== 'message.committed' || typeof chatId !== 'string' ||
            chatId.endsWith('@chatroom') || event.data.origin !== 'live' ||
            event.data.direction !== 'incoming' || typeof event.data.messageId !== 'string') continue;
        const message = await wx('messages', 'get', event.data.messageId);
        if (message.threadId !== chatId || message.direction !== 'incoming' ||
            message.type !== 1 || typeof message.body !== 'string') continue;
        const question = message.body.trim();
        if (!question) continue;

        const chat = await wx('chats', 'get', chatId);
        if (chat.kind !== 'direct' || chat.peerId !== chatId) continue;
        const contact = await wx('contacts', 'get', chatId);
        if (contact.relation !== 'friend') continue;

        const session = createHash('sha256').update(JSON.stringify([account, chatId])).digest('hex');
        const reply = await getFastGPTReply(question, 'wechat-agent:' + session, config);
        const key = createHash('sha256').update(event.data.messageId).digest('hex');
        const result = await wx('messages', 'send', chatId, '--text=' + reply, '--idempotency-key', key);
        console.log('WeChat send state:', result.state || 'see Agent WeChat receipts');
      } catch {
        console.error('Could not process a WeChat event');
      }
    }
    if (await stopped) throw new Error('Agent WeChat event stream stopped. Run wx events watch to see its error.');
  } finally {
    lines.close();
    stream.kill();
    process.removeListener('SIGINT', stop);
  }
}

main().catch(error => {
  console.error((/^(Set FASTGPT|Agent WeChat)/).test(error.message)
    ? error.message : 'Could not connect to Agent WeChat. Check wx serve and the account alias.');
  process.exitCode = 1;
});
