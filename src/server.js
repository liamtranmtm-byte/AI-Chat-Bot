require('dotenv').config();
const path = require('path');
const express = require('express');
const { getAIReply, getHistory } = require('./claudeClient');
const { sendTextMessage, refreshAccessToken } = require('./zaloClient');
const { extractLead } = require('./leadExtractor');
const { appendLead, loadLeads } = require('./leadStore');

const app = express();
app.use(express.json());

// Kiem tra server song, dung de test nhanh sau khi deploy
app.get('/', (req, res) => res.send('Zalo AI chatbot dang chay OK'));

// Trang demo chat doc lap, khong dung Zalo - dung de pitch khach truoc khi
// ho can tra tien goi Zalo OA. Sau khi deploy, mo: https://ten-app.onrender.com/demo
app.use('/demo', express.static(path.join(__dirname, '..', 'public')));

// Endpoint dung rieng cho trang demo - tai su dung dung 1 bo nao AI voi ban Zalo that,
// chi khac o cho khong goi sendTextMessage() cua Zalo
app.post('/demo-chat', async (req, res) => {
  try {
    const { userId, message } = req.body;
    if (!userId || !message) {
      return res.status(400).json({ error: 'Thieu userId hoac message' });
    }

    const aiReply = await getAIReply(userId, message);
    res.json({ reply: aiReply });

    // Ghi lead ngam giong nhu ben Zalo, de demo cung the hien duoc phan nay
    extractLead(userId, getHistory(userId))
      .then((lead) => {
        if (lead.has_lead) appendLead(lead);
      })
      .catch((err) => console.error('Loi trich xuat lead (demo):', err.message));
  } catch (err) {
    console.error('Loi demo-chat:', err);
    res.status(500).json({ error: 'Bot dang gap su co, thu lai sau' });
  }
});

// Zalo se POST toi day moi khi co su kien (tin nhan, follow, ...)
app.post('/webhook', async (req, res) => {
  // Tra loi 200 ngay de Zalo khong bao timeout, xu ly AI chay ben duoi
  res.sendStatus(200);

  const event = req.body;

  try {
    if (event.event_name === 'user_send_text') {
      const userId = event.sender.id;
      const userMessage = event.message.text;

      console.log(`Tin nhan tu ${userId}: ${userMessage}`);

      const aiReply = await getAIReply(userId, userMessage);
      await sendTextMessage(userId, aiReply);

      console.log(`Da tra loi ${userId}: ${aiReply}`);

      // Chay ngam, khong lam cham viec tra loi khach
      extractLead(userId, getHistory(userId))
        .then((lead) => {
          if (lead.has_lead) {
            appendLead(lead);
            console.log(`Da ghi lead moi tu ${userId}:`, lead);
          }
        })
        .catch((err) => console.error('Loi khi trich xuat lead:', err.message));
    }
    // Co the xu ly them cac event_name khac: user_send_image, follow, unfollow...
  } catch (err) {
    console.error('Loi khi xu ly webhook:', err);
  }
});

// Xem danh sach lead da ghi nhan - vd: /leads?key=xxxx
// MVP dung 1 key don gian, ban that nen doi sang dang nhap/JWT
app.get('/leads', (req, res) => {
  if (req.query.key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Sai key' });
  }
  res.json(loadLeads());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server dang chay o port ${PORT}`);
});

// Tu dong lam moi Zalo access_token moi 20 tieng (truoc khi het han ~25h)
setInterval(() => {
  refreshAccessToken().catch((err) => console.error('Loi refresh token dinh ky:', err.message));
}, 20 * 60 * 60 * 1000);
