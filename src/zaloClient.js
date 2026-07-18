const { loadTokens, saveTokens } = require('./tokenStore');

let tokens = loadTokens();

// Zalo access_token het han sau ~25h, refresh_token dung 1 lan roi doi cai moi.
// Goi ham nay dinh ky (vd moi 20h) hoac khi gap loi 401 tu API gui tin.
async function refreshAccessToken() {
  const res = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      secret_key: process.env.ZALO_SECRET_KEY,
    },
    body: new URLSearchParams({
      app_id: process.env.ZALO_APP_ID,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  });

  const data = await res.json();
  if (!data.access_token) {
    console.error('Refresh token that bai:', data);
    throw new Error('Khong the lam moi Zalo access_token, kiem tra lai ZALO_SECRET_KEY / refresh_token');
  }

  tokens = { access_token: data.access_token, refresh_token: data.refresh_token };
  saveTokens(tokens);
  console.log('Da lam moi Zalo access_token');
  return tokens.access_token;
}

// Gui 1 message payload toi Zalo OA (tu dong refresh token va thu lai 1 lan neu het han).
// Chi gui duoc trong vong 7 ngay ke tu tin nhan gan nhat cua user (gioi han OA chua xac thuc).
async function sendMessage(message) {
  const doSend = async () => {
    const res = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: tokens.access_token,
      },
      body: JSON.stringify(message),
    });
    return res.json();
  };

  let result = await doSend();

  // Token het han -> lam moi roi thu lai 1 lan
  if (result.error === -216 || result.error === -14) {
    await refreshAccessToken();
    result = await doSend();
  }

  if (result.error && result.error !== 0) {
    console.error('Zalo tra loi loi khi gui tin:', result);
  }
  return result;
}

// Gui tin nhan van ban toi 1 user_id cu the.
async function sendTextMessage(userId, text) {
  return sendMessage({
    recipient: { user_id: userId },
    message: { text },
  });
}

// Gui tin nhan ANH (kem caption tuy chon) qua template media cua Zalo OA.
// imageUrl phai la URL cong khai (Zalo tu tai anh tu URL nay).
async function sendImageMessage(userId, imageUrl, caption) {
  if (!imageUrl) return null;
  const message = {
    recipient: { user_id: userId },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'media',
          elements: [{ media_type: 'image', url: imageUrl }],
        },
      },
    },
  };
  if (caption) message.message.text = caption;
  return sendMessage(message);
}

module.exports = { refreshAccessToken, sendTextMessage, sendImageMessage };
