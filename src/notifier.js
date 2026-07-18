// Thong bao lead / handoff cho nhan vien theo thoi gian thuc qua 1 webhook URL.
// Dat LEAD_NOTIFY_WEBHOOK_URL = URL webhook cua kenh nhan vien:
//  - Slack / Google Chat: nhan truong {"text": "..."}
//  - Discord: nhan truong {"content": "..."}
//  -> gui ca hai truong nen dung duoc voi ca ba. (Telegram can relay rieng.)
// Neu khong dat bien -> bo qua (khong loi), tinh nang tat.

const WEBHOOK = process.env.LEAD_NOTIFY_WEBHOOK_URL || '';

function isEnabled() {
  return Boolean(WEBHOOK);
}

function formatMessage(lead) {
  const yesNo = (v) => (v === true || v === 'Co' || v === 'co' ? 'Có' : '');
  const lines = [
    '🔔 STWatch bot — khách cần chú ý',
    lead.needs_human ? '⚠️ KHÁCH CẦN NHÂN VIÊN THẬT' : null,
    `Nguồn: ${lead.source || '-'}`,
    lead.name ? `Tên: ${lead.name}` : null,
    lead.phone ? `SĐT: ${lead.phone}` : null,
    lead.watch_model ? `Mẫu quan tâm: ${lead.watch_model}` : null,
    lead.budget ? `Ngân sách: ${lead.budget}` : null,
    yesNo(lead.wants_appointment) ? `Muốn đặt lịch: ${yesNo(lead.wants_appointment)}` : null,
    lead.preferred_time ? `Thời gian hẹn: ${lead.preferred_time}` : null,
    lead.userId ? `User ID: ${lead.userId}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

// Gui thong bao (fire-and-forget, khong lam cham viec tra loi khach).
async function notifyLead(lead) {
  if (!WEBHOOK) return;
  const text = formatMessage(lead);
  try {
    const res = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, content: text }),
    });
    if (!res.ok) console.error('Webhook thong bao lead tra ve loi:', res.status);
  } catch (err) {
    console.error('Loi gui thong bao lead:', err.message);
  }
}

module.exports = { notifyLead, isEnabled };
