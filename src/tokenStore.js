// Luu access_token / refresh_token vao file de dung lai sau khi server restart.
// Zalo OA: moi lan refresh se tra ve CA access_token va refresh_token MOI,
// nen bat buoc phai luu lai refresh_token moi nhat, khong the dung mai token cu.
const fs = require('fs');
const path = require('path');

const TOKEN_FILE = path.join(__dirname, '..', 'tokens.json');

function loadTokens() {
  if (fs.existsSync(TOKEN_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    } catch (err) {
      console.error('Khong doc duoc tokens.json, dung gia tri tu .env:', err.message);
    }
  }
  // Lan dau chay: lay tu bien moi truong (nhap tay sau buoc OAuth ban dau)
  return {
    access_token: process.env.ZALO_ACCESS_TOKEN || '',
    refresh_token: process.env.ZALO_REFRESH_TOKEN || '',
  };
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), 'utf8');
}

module.exports = { loadTokens, saveTokens };
