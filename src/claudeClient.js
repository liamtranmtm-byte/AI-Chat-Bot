const { STWATCH_PROFILE } = require('./data/stwatchProfile');

// Luu lich su hoi thoai ngan han theo tung user (trong RAM, mat khi restart server).
// Voi luong nguoi dung lon hon, nen chuyen sang luu vao Redis/DB.
const conversations = new Map();
const MAX_TURNS = 6; // giu 6 luot gan nhat de tranh gui qua nhieu token moi lan goi

function getHistory(userId) {
  if (!conversations.has(userId)) conversations.set(userId, []);
  return conversations.get(userId);
}

async function getAIReply(userId, userMessage) {
  const history = getHistory(userId);
  history.push({ role: 'user', content: userMessage });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 500,
      system: `${process.env.SYSTEM_PROMPT || 'Ban la tro ly AI tu van ban hang than thien, tra loi bang tieng Viet, ngan gon, khong dai dong.'}\n\n${STWATCH_PROFILE}`,
      messages: history.slice(-MAX_TURNS),
    }),
  });

  const data = await res.json();
  const reply = data?.content?.find((block) => block.type === 'text')?.text
    || 'Xin loi, minh dang gap su co, ban thu lai sau nhe.';

  history.push({ role: 'assistant', content: reply });
  return reply;
}

module.exports = { getAIReply, getHistory };
