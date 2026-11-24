const { decodeHTMLStrict } = require('entities');

const FASTGPT_URL = 'https://cloud.fastgpt.io/api/v1/chat/completions';
const FALLBACK_REPLY = '抱歉，暫時無法回覆，請稍後再試。';

function formatTextReply(markdown) {
  const text = markdown
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/gm, '$1')
    .replace(/^([ \t]*)[-*+][ \t]+/gm, '$1• ')
    .replace(/(\*\*|__)(?=\S)(.+?)\1/g, '$2')
    .replace(/(^|[\s(])([*_])(?=\S)([^\n]+?)\2(?=$|[\s).,!?:])/gm, '$1$3')
    .replace(/\[((?:\\.|[^[\]\\]|\[[^[\]]*\])+)\]\((https?:\/\/(?:[^\s()]|\([^\s()]*\))+)\)([.,;!?]?)/g,
      (_, label, url, punctuation) => label.replace(/\\([\[\]])/g, '$1') + punctuation + '\n' + url);
  return decodeHTMLStrict(text).trim();
}

async function getFastGPTReply(message, chatId, config) {
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
        chatId: chatId,
        stream: false,
        detail: false,
        messages: [{ role: 'user', content: message }],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (response.ok) {
      const data = await response.json();
      const answer = data?.choices?.[0]?.message;
      const content = Array.isArray(answer?.content)
        ? answer.content.map(part => typeof part?.text === 'string' ? part.text : part?.text?.content)
          .filter(value => typeof value === 'string' && value.trim()).join('\n')
        : answer?.content;
      if (typeof content === 'string' && content.trim()) {
        reply = content;
      } else if (data?.error || data?.success === false || Number(data?.code) >= 400) {
        const code = Number(data?.error?.code ?? data?.code);
        console.error('FastGPT reported a workflow or API error',
          ...(Number.isInteger(code) && code > 0 ? [code] : []));
      } else if (answer?.reasoning_content || answer?.tool_calls?.length ||
          (Array.isArray(answer?.content) && answer.content.some(part => part?.interactive))) {
        console.error('FastGPT returned reasoning, a tool call, or an interactive step without an answer');
      } else {
        console.error(answer ? 'FastGPT returned an empty assistant answer' : 'FastGPT returned no assistant message');
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

  return formatTextReply(reply) || FALLBACK_REPLY;
}

module.exports = { getFastGPTReply };
