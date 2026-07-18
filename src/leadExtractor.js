// Goi them 1 lan Claude (rieng biet voi cau tra loi chinh) de "doc" hoi thoai
// va rut ra thong tin lead dang JSON. Tach rieng khoi cau tra loi chinh de
// prompt tra loi khach khong bi anh huong boi yeu cau "xuat JSON".
async function extractLead(userId, history, meta = {}) {
  const recentTurns = history.slice(-6)
    .map((m) => `${m.role === 'user' ? 'Khach' : 'Bot'}: ${m.content}`)
    .join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 300,
      system: `Doc doan hoi thoai giua khach va bot tu van dong ho. Tra ve DUY NHAT
mot JSON object, khong them chu nao khac, khong dung markdown, theo dung schema:
{"has_lead": boolean, "name": string|null, "phone": string|null, "watch_model": string|null, "budget": string|null, "wants_appointment": boolean, "preferred_time": string|null}
has_lead = true neu khach co the hien y dinh mua/ban/tham dinh/dat lich RO RANG,
hoac co de lai SDT. Neu chi hoi thong tin chung chung (vd "shop o dau") thi has_lead = false.`,
      messages: [{ role: 'user', content: recentTurns }],
    }),
  });

  const data = await res.json();
  const text = data?.content?.find((b) => b.type === 'text')?.text || '{}';

  try {
    const parsed = JSON.parse(text);
    return { userId, ...parsed, ...meta };
  } catch (err) {
    console.error('Khong parse duoc JSON lead extraction:', text);
    return { userId, has_lead: false, ...meta };
  }
}

module.exports = { extractLead };
