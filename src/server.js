require('dotenv').config();
const path = require('path');
const express = require('express');
const { getAIReply, getHistory } = require('./claudeClient');
const { sendTextMessage, sendImageMessage, refreshAccessToken } = require('./zaloClient');
const { extractLead } = require('./leadExtractor');
const { appendLead, loadLeads } = require('./leadStore');
const { checkRate } = require('./rateLimiter');
const { streamImage } = require('./driveImages');

const app = express();
app.use(express.json());

// Cau tra loi mac dinh khi user bi chan spam (khong goi Claude)
const RATE_LIMIT_REPLY = 'Dạ anh/chị ơi, anh/chị nhắn hơi nhanh nên em xử lý chưa kịp ạ. '
  + 'Anh/chị chờ em vài giây rồi nhắn lại giúp em nhé ạ.';

// Kiem tra server song, dung de test nhanh sau khi deploy
app.get('/', (req, res) => res.send('Zalo AI chatbot dang chay OK'));

// Trang demo chat doc lap, khong dung Zalo - dung de pitch khach truoc khi
// ho can tra tien goi Zalo OA. Sau khi deploy, mo: https://ten-app.onrender.com/demo
app.use('/demo', express.static(path.join(__dirname, '..', 'public')));

// Phuc vu anh san pham that (lay tu folder Google Drive theo ma san pham).
// URL nay duoc gui cho khach (demo + Zalo) thay vi hotlink truc tiep Drive.
app.get('/img/:id', async (req, res) => {
  try {
    const ok = await streamImage(req.params.id, res);
    if (!ok && !res.headersSent) res.status(404).send('Khong tim thay anh');
  } catch (err) {
    console.error('Loi phuc vu anh:', err.message);
    if (!res.headersSent) res.status(500).send('Loi tai anh');
  }
});

// Endpoint dung rieng cho trang demo - tai su dung dung 1 bo nao AI voi ban Zalo that,
// chi khac o cho khong goi Zalo. Tra ve them imageUrl (neu bot muon khoe anh) va handoff.
app.post('/demo-chat', async (req, res) => {
  try {
    const { userId, message } = req.body;
    if (!userId || !message) {
      return res.status(400).json({ error: 'Thieu userId hoac message' });
    }

    // Chan spam: neu vuot gioi han, tra loi mac dinh, khong goi Claude
    const rate = checkRate(userId);
    if (!rate.allowed) {
      return res.json({ reply: RATE_LIMIT_REPLY, rateLimited: true });
    }

    const { reply, imageUrl, handoff } = await getAIReply(userId, message);
    res.json({ reply, imageUrl, handoff });

    // Ghi lead ngam giong nhu ben Zalo, de demo cung the hien duoc phan nay
    extractLead(userId, getHistory(userId), { source: 'demo', needs_human: handoff })
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

      // Chan spam: neu vuot gioi han, gui cau mac dinh, khong goi Claude
      const rate = checkRate(userId);
      if (!rate.allowed) {
        await sendTextMessage(userId, RATE_LIMIT_REPLY);
        return;
      }

      const { reply, imageUrl, handoff } = await getAIReply(userId, userMessage);
      await sendTextMessage(userId, reply);

      // Neu bot xac dinh dung 1 mau con hang -> gui kem anh
      if (imageUrl) {
        await sendImageMessage(userId, imageUrl);
        console.log(`Da gui anh ${imageUrl} cho ${userId}`);
      }

      console.log(`Da tra loi ${userId}: ${reply}${handoff ? ' [HANDOFF]' : ''}`);

      // Chay ngam, khong lam cham viec tra loi khach
      extractLead(userId, getHistory(userId), { source: 'zalo', needs_human: handoff })
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
app.get('/leads', async (req, res) => {
  if (req.query.key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Sai key' });
  }
  try {
    res.json(await loadLeads());
  } catch (err) {
    console.error('Loi doc lead:', err.message);
    res.status(500).json({ error: 'Khong doc duoc danh sach lead' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server dang chay o port ${PORT}`);
});

// Tu dong lam moi Zalo access_token moi 20 tieng (truoc khi het han ~25h).
// Chi chay khi da cau hinh Zalo (co ZALO_APP_ID) de tranh loi vo nghia khi chi chay demo.
if (process.env.ZALO_APP_ID) {
  setInterval(() => {
    refreshAccessToken().catch((err) => console.error('Loi refresh token dinh ky:', err.message));
  }, 20 * 60 * 60 * 1000);
}
