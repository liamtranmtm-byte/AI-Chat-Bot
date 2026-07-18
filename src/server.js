require('dotenv').config();
const path = require('path');
const express = require('express');
const { getAIReply, getAIReplyForImage, getHistory } = require('./claudeClient');
const { sendTextMessage, sendImageMessage, refreshAccessToken } = require('./zaloClient');
const { extractLead } = require('./leadExtractor');
const { appendLead, loadLeads } = require('./leadStore');
const { checkRate } = require('./rateLimiter');
const { streamImage } = require('./driveImages');
const { notifyLead } = require('./notifier');

const app = express();
app.use(express.json({ limit: '12mb' })); // du cho anh base64 khach gui o demo

// Cau tra loi mac dinh khi user bi chan spam (khong goi Claude)
const RATE_LIMIT_REPLY = 'Dạ anh/chị ơi, anh/chị nhắn hơi nhanh nên em xử lý chưa kịp ạ. '
  + 'Anh/chị chờ em vài giây rồi nhắn lại giúp em nhé ạ.';

// Tach base64 tu data URL: "data:image/jpeg;base64,XXXX"
function parseDataUrl(dataUrl) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl || '');
  return m ? { mediaType: m[1], base64: m[2] } : null;
}

// Trich lead ngam + thong bao nhan vien (khong lam cham viec tra loi khach).
function handleLeadAndNotify(userId, source, handoff) {
  extractLead(userId, getHistory(userId), { source, needs_human: handoff })
    .then((lead) => {
      if (lead.has_lead) {
        appendLead(lead);
        notifyLead(lead);
        console.log(`Da ghi lead moi tu ${userId}`);
      } else if (handoff) {
        // Khach can nguoi that nhung chua de lai thong tin -> van bao nhan vien
        notifyLead({ userId, source, needs_human: true });
      }
    })
    .catch((err) => console.error('Loi trich xuat/thong bao lead:', err.message));
}

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

// Endpoint dung rieng cho trang demo - tai su dung dung 1 bo nao AI voi ban Zalo that.
// Nhan { userId, message, image? } - neu co "image" (data URL) -> luong dinh gia qua vision.
app.post('/demo-chat', async (req, res) => {
  try {
    const { userId, message, image } = req.body;
    if (!userId || (!message && !image)) {
      return res.status(400).json({ error: 'Thieu userId, message hoac image' });
    }

    // Chan spam: neu vuot gioi han, tra loi mac dinh, khong goi Claude
    const rate = checkRate(userId);
    if (!rate.allowed) {
      return res.json({ reply: RATE_LIMIT_REPLY, rateLimited: true });
    }

    let result;
    if (image) {
      const parsed = parseDataUrl(image);
      if (!parsed) return res.status(400).json({ error: 'Anh khong hop le' });
      result = await getAIReplyForImage(userId, { base64: parsed.base64, mediaType: parsed.mediaType }, message);
    } else {
      result = await getAIReply(userId, message);
    }

    res.json({
      reply: result.reply,
      imageUrl: result.imageUrl || null,
      clipUrl: result.clipUrl || null,
      handoff: result.handoff || false,
    });

    handleLeadAndNotify(userId, image ? 'demo-anh' : 'demo', result.handoff);
  } catch (err) {
    console.error('Loi demo-chat:', err);
    res.status(500).json({ error: 'Bot dang gap su co, thu lai sau' });
  }
});

// Zalo se POST toi day moi khi co su kien (tin nhan, anh, follow, ...)
app.post('/webhook', async (req, res) => {
  // Tra loi 200 ngay de Zalo khong bao timeout, xu ly AI chay ben duoi
  res.sendStatus(200);

  const event = req.body;

  try {
    // Khach gui TIN NHAN VAN BAN
    if (event.event_name === 'user_send_text') {
      const userId = event.sender.id;
      const userMessage = event.message.text;
      console.log(`Tin nhan tu ${userId}: ${userMessage}`);

      const rate = checkRate(userId);
      if (!rate.allowed) {
        await sendTextMessage(userId, RATE_LIMIT_REPLY);
        return;
      }

      const { reply, imageUrl, clipUrl, handoff } = await getAIReply(userId, userMessage);
      await sendTextMessage(userId, reply);

      if (imageUrl) {
        await sendImageMessage(userId, imageUrl);
        console.log(`Da gui anh ${imageUrl} cho ${userId}`);
      }
      if (clipUrl) {
        await sendTextMessage(userId, `🎬 Anh/chị xem clip mẫu này nhé: ${clipUrl}`);
      }

      console.log(`Da tra loi ${userId}: ${reply}${handoff ? ' [HANDOFF]' : ''}`);
      handleLeadAndNotify(userId, 'zalo', handoff);
    }

    // Khach GUI ANH -> luong dinh gia / thu mua (Claude vision)
    if (event.event_name === 'user_send_image') {
      const userId = event.sender.id;
      const att = (event.message && event.message.attachments || []).find((a) => a.type === 'image');
      const url = att && att.payload && att.payload.url;
      if (!url) return;

      console.log(`Anh dinh gia tu ${userId}: ${url}`);

      const rate = checkRate(userId);
      if (!rate.allowed) {
        await sendTextMessage(userId, RATE_LIMIT_REPLY);
        return;
      }

      const { reply } = await getAIReplyForImage(userId, { url });
      await sendTextMessage(userId, reply);
      console.log(`Da tra loi (dinh gia) ${userId}`);
      handleLeadAndNotify(userId, 'zalo-anh', true);
    }
    // Co the xu ly them: follow, unfollow...
  } catch (err) {
    console.error('Loi khi xu ly webhook:', err);
  }
});

// Chan doan: xem chinh xac catalog server doc duoc tu Sheet (co cot clip khong?).
// Vd: /debug/catalog?key=ADMIN_KEY
app.get('/debug/catalog', async (req, res) => {
  if (req.query.key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Sai key' });
  }
  try {
    const { getProducts } = require('./catalog');
    const { isConfigured } = require('./driveImages');
    const products = await getProducts();
    res.json({
      driveImageConfigured: isConfigured(),
      count: products.length,
      products: products.map((p) => ({
        id: p.id, name: p.name, inStock: p.inStock,
        image: p.image || '', hasClip: Boolean(p.clip), clip: p.clip || '',
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
