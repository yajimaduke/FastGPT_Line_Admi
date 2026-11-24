const { createHash } = require('node:crypto');
const { getFastGPTReply } = require('../lib/fastgpt');
const { WechatyBuilder, ScanStatus } = require('wechaty');
const { PuppetPadlocal } = require('wechaty-puppet-padlocal');
const qrcode = require('qrcode-terminal');

const config = process.env;
for (const key of ['FASTGPT_API_KEY', 'FASTGPT_APP_ID', 'WECHATY_PUPPET_PADLOCAL_TOKEN']) {
  if (!config[key]) throw new Error(`Missing environment variable: ${key}`);
}

const bot = WechatyBuilder.build({
  name: 'chatadmission-wechat',
  puppet: new PuppetPadlocal({ token: config.WECHATY_PUPPET_PADLOCAL_TOKEN }),
});

bot.on('scan', (code, status) => {
  if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
    console.log('Scan with the demo WeChat account');
    qrcode.generate(code, { small: true });
  }
});

bot.on('login', () => console.log('WeChat demo bot signed in'));
bot.on('error', () => console.error('Wechaty reported an error'));

bot.on('message', async message => {
  if (message.self() || message.room() || message.type() !== bot.Message.Type.Text) return;
  const question = /^AI\s+(.+)$/is.exec(message.text().trim())?.[1]?.trim();
  if (!question) return;

  const chatId = 'wechat:' + createHash('sha256')
    .update(JSON.stringify([bot.currentUser.id, message.talker().id]))
    .digest('hex');
  try {
    const reply = await getFastGPTReply(question, chatId, config);
    await message.say(reply);
  } catch {
    console.error('WeChat reply failed');
  }
});

bot.start().catch(() => {
  console.error('Could not start the WeChat bot');
  process.exitCode = 1;
});
