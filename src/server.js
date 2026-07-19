require('dotenv').config();
const path = require('path');
const express = require('express');
const { getAIReply, getAIReplyForImage, getHistory } = require('./claudeClient');
const { sendTextMessage, sendImageMessage, refreshAccessToken } = require('./zaloClient');
const { extractLead } = require('./leadExtractor');
const { appendLead, loadLeads, resetLeads } = require('./leadStore');
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

// Xem phien ban code dang chay (de xac nhan Render da deploy dung commit).
app.get('/version', (req, res) => res.json({ build: require('./version') }));

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

// Selftest chay NEN (nhieu lan goi Claude ~30-60s) -> khong giu ket noi cho lau
// (tranh ERR_CONNECTION_ABORTED tren Render free). Bam /admin/selftest de khoi chay,
// roi mo /admin/selftest-result de xem ket qua (hoac cho webhook).
let lastSelfTest = { status: 'none' };

async function runAndStoreSelfTest(leadWrite) {
  lastSelfTest = { status: 'running', startedAt: new Date().toISOString(), leadWrite };
  try {
    const { runSelfTest } = require('./selftest');
    const { notifyText } = require('./notifier');
    const r = await runSelfTest({ leadWrite });
    lastSelfTest = { status: 'done', ...r };
    const fails = r.results.filter((x) => x.status === 'FAIL' || x.status === 'ERROR');
    const head = `🧪 Selftest STWatch: PASS ${r.summary.PASS || 0} · FAIL ${r.summary.FAIL || 0} · REVIEW ${r.summary.REVIEW || 0} · ERROR ${r.summary.ERROR || 0}`;
    const body = fails.length ? '\n' + fails.map((x) => `❌ ${x.scenario}: ${x.check}`).join('\n') : '\n✅ Tất cả kịch bản đạt.';
    console.log(head + body);
    await notifyText(head + body);
  } catch (err) {
    lastSelfTest = { status: 'error', error: err.message, at: new Date().toISOString() };
    console.error('Loi selftest:', err.message);
  }
}

// Khoi chay selftest (tra ve ngay). Them &leadwrite=1 de test ghi Sheet.
app.get('/admin/selftest', (req, res) => {
  if (req.query.key !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Sai key' });
  if (lastSelfTest.status === 'running') {
    return res.json({ status: 'running', startedAt: lastSelfTest.startedAt, note: 'Dang chay, mo /admin/selftest-result de xem ket qua.' });
  }
  runAndStoreSelfTest(req.query.leadwrite === '1'); // chay nen, khong await
  res.json({ started: true, note: 'Selftest dang chay (~30-60s). Mo /admin/selftest-result?key=... de xem ket qua, hoac cho webhook.' });
});

// Xem ket qua selftest gan nhat.
app.get('/admin/selftest-result', (req, res) => {
  if (req.query.key !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Sai key' });
  res.json(lastSelfTest);
});

// Don sach tab Leads (giu tieu de) - dung de xoa dong rac cu. Vd:
// /admin/leads-reset?key=ADMIN_KEY  (GET cho tien mo tren trinh duyet)
app.get('/admin/leads-reset', async (req, res) => {
  if (req.query.key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Sai key' });
  }
  try {
    const result = await resetLeads();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Loi reset leads:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server dang chay o port ${PORT}`);
});

// Tu chay selftest luc khoi dong (dat SELFTEST_ON_START=1). Ket qua ghi ra log Render
// + day ve LEAD_NOTIFY_WEBHOOK_URL neu co. LUU Y: Render free "ngu" roi khoi dong lai ->
// se chay lai moi lan cold start (ton token). Chay xong nen BO bien nay di.
if (process.env.SELFTEST_ON_START === '1') {
  setTimeout(() => runAndStoreSelfTest(process.env.SELFTEST_LEADWRITE === '1'), 4000);
}

// Tu dong lam moi Zalo access_token moi 20 tieng (truoc khi het han ~25h).
// Chi chay khi da cau hinh Zalo (co ZALO_APP_ID) de tranh loi vo nghia khi chi chay demo.
if (process.env.ZALO_APP_ID) {
  setInterval(() => {
    refreshAccessToken().catch((err) => console.error('Loi refresh token dinh ky:', err.message));
  }, 20 * 60 * 60 * 1000);
}
