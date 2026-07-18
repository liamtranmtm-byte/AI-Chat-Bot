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

// Gui tin nhan van ban toi 1 user_id cu the (chi gui duoc trong vong 7 ngay
// ke tu tin nhan gan nhat cua user, day la gioi han cua OA chua xac thuc)
async function sendTextMessage(userId, text) {
  const doSend = async () => {
    const res = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: tokens.access_token,
      },
      body: JSON.stringify({
        recipient: { user_id: userId },
        message: { text },
      }),
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

module.exports = { refreshAccessToken, sendTextMessage };
