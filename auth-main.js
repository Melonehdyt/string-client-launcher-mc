/**
 * String Client — Microsoft OAuth / XAL Auth Module (Main Process)
 *
 * Full flow: PKCE → SISU Device Auth → Browser Login → Code Exchange
 * → SISU Authorize → XSTS → Minecraft Login → Profile
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');
const { app, BrowserWindow, session: electronSession } = require('electron');
const jose = require('jose');
const SmartBuffer = require('smart-buffer').SmartBuffer;

const CLIENT_ID = '00000000402b5328';
const TITLE_ID = '1794566092';
const MS_REDIRECT_URL = 'https://login.live.com/oauth20_desktop.srf';
const MS_AUTH_TOKEN_URL = 'https://login.live.com/oauth20_token.srf';
const MS_AUTH_DEVICE_TOKEN_URL = 'https://device.auth.xboxlive.com/device/authenticate';
const SISU_AUTHENTICATE_URL = 'https://sisu.xboxlive.com/authenticate';
const SISU_AUTHORIZE_URL = 'https://sisu.xboxlive.com/authorize';
const XSTS_AUTH_URL = 'https://xsts.auth.xboxlive.com/xsts/authorize';
const MC_LOGIN_URL = 'https://api.minecraftservices.com/launcher/login';
const MC_PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile';
const MC_ENTITLEMENTS_URL = 'https://api.minecraftservices.com/entitlements/mcstore';
const XBL_SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL';
const USER_AGENT = 'XAL Win32 2021.11.20220411.002';

function httpRequest(url, method, body, headers, timeout) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const opts = {
      method: method || 'GET',
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: headers || {},
      timeout: timeout || 15000,
    };
    const req = mod.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsedBody;
        try { parsedBody = JSON.parse(data); } catch { parsedBody = data; }
        resolve({ status: res.statusCode, headers: res.headers, data: parsedBody });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

function getWindowsTimestamp(date) {
  return (BigInt(Math.floor((date || Date.now()) / 1000)) + 11644473600n) * 10000000n;
}

function signPayload(url, contentType, body, keyPair, timestamp) {
  const ts = getWindowsTimestamp(timestamp);
  const parsedUrl = new URL(url);
  const pathname = parsedUrl.pathname;
  const bodyLen = Buffer.byteLength(body, 'utf8');
  const te = 19 + pathname.length + 1 + (contentType || '').length + 1 + bodyLen + 1;
  const buf = SmartBuffer.fromSize(te);
  buf.writeInt32BE(1);
  buf.writeUInt8(0);
  buf.writeBigUInt64BE(ts);
  buf.writeUInt8(0);
  buf.writeStringNT('POST');
  buf.writeStringNT(pathname);
  buf.writeStringNT(contentType || '');
  buf.writeStringNT(body);
  const sig = crypto.sign('SHA256', buf.toBuffer(), {
    key: keyPair.privateKey,
    dsaEncoding: 'ieee-p1363'
  });
  const out = SmartBuffer.fromSize(sig.length + 12);
  out.writeInt32BE(1);
  out.writeBigUInt64BE(ts);
  out.writeBuffer(sig);
  return out.toBuffer();
}

async function getSisuDeviceInfo() {
  const keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = { ...(await jose.exportJWK(keyPair.publicKey)), alg: 'ES256', use: 'sig' };
  const cv = crypto.randomUUID();
  const deviceId = crypto.randomUUID();
  const payload = JSON.stringify({
    Properties: {
      AuthMethod: 'ProofOfPossession',
      Id: `{${deviceId}}`,
      DeviceType: 'Win32',
      SerialNumber: `{${deviceId}}`,
      Version: '10.16.0',
      ProofKey: jwk,
    },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT',
  });
  const signature = signPayload(MS_AUTH_DEVICE_TOKEN_URL, '', payload, keyPair).toString('base64');
  const headers = {
    'Cache-Control': 'no-store, must-revalidate, no-cache',
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
    Expect: '100-continue',
    'x-xbl-contract-version': '1',
    'MS-CV': cv,
    Signature: signature,
  };
  const res = await httpRequest(MS_AUTH_DEVICE_TOKEN_URL, 'POST', payload, headers);
  return { deviceToken: res.data.Token, issueInstant: Date.parse(res.data.IssueInstant), keyPair, jwk, correlationVector: cv };
}

async function doSisuAuthenticate(deviceToken, keyPair, codeChallenge, cv, timestamp) {
  const state = crypto.randomBytes(64).toString('base64url');
  const payload = JSON.stringify({
    AppId: CLIENT_ID, TitleId: TITLE_ID, RedirectUri: MS_REDIRECT_URL,
    DeviceToken: deviceToken, Sandbox: 'RETAIL', TokenType: 'code',
    Offers: [XBL_SCOPE],
    Query: { code_challenge: codeChallenge, code_challenge_method: 'S256', state, prompt: 'select_account' },
  });
  const signature = signPayload(SISU_AUTHENTICATE_URL, '', payload, keyPair, timestamp).toString('base64');
  const headers = {
    'Cache-Control': 'no-store, must-revalidate, no-cache',
    'Content-Type': 'application/json', 'User-Agent': USER_AGENT,
    'MS-CV': cv, Expect: '100-continue', 'x-xbl-contract-version': '1', Signature: signature,
  };
  const res = await httpRequest(SISU_AUTHENTICATE_URL, 'POST', payload, headers);
  return { msaOauthRedirectUrl: res.data.MsaOauthRedirect, sessionId: res.headers['x-sessionid'], state };
}

function initAuthWindow(authUrl) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 510, height: 600, autoHideMenuBar: true, show: false,
      resizable: false, title: 'String Client — Sign in with Microsoft',
      fullscreenable: false,
      webPreferences: { partition: 'in-memory-auth', sandbox: false, nodeIntegration: false, contextIsolation: true },
    });
    const ua = win.webContents.getUserAgent().replace(/\sElectron\/\S+/, '');
    win.webContents.setUserAgent(ua);
    electronSession.fromPartition('in-memory-auth').setUserAgent(ua);
    let matchedUrl = null;
    const check = (url) => { if (url.startsWith(MS_REDIRECT_URL)) { matchedUrl = url; win.close(); return true; } return false; };
    win.webContents.on('will-redirect', (_, url) => check(url));
    win.webContents.on('did-navigate', (_, url) => check(url));
    win.webContents.on('did-navigate-in-page', (_, url) => check(url));
    win.on('close', () => { win.removeAllListeners(); resolve({ url: matchedUrl, cancelled: !matchedUrl }); });
    win.once('ready-to-show', () => win.show());
    win.webContents.session.clearStorageData()
      .then(() => win.webContents.session.clearCache())
      .then(() => win.loadURL(authUrl))
      .catch(() => resolve({ url: null, cancelled: true }));
  });
}

async function getMsAccessToken(code, codeVerifier) {
  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID); params.append('code', code);
  params.append('grant_type', 'authorization_code'); params.append('code_verifier', codeVerifier);
  params.append('redirect_uri', MS_REDIRECT_URL); params.append('scope', XBL_SCOPE);
  const res = await httpRequest(MS_AUTH_TOKEN_URL, 'POST', params.toString(), { 'Content-Type': 'application/x-www-form-urlencoded' });
  if (res.status !== 200) throw new Error('Token exchange failed');
  return { refreshToken: res.data.refresh_token, accessToken: res.data.access_token };
}

async function doSisuAuthorize(msAccessToken, deviceToken, jwk, keyPair, cv, sessionId, timestamp) {
  const payload = JSON.stringify({
    AccessToken: `t=${msAccessToken}`, AppId: CLIENT_ID, DeviceToken: deviceToken,
    Sandbox: 'RETAIL', SiteName: 'user.auth.xboxlive.com', ProofKey: jwk,
    ...(sessionId ? { SessionId: sessionId } : {}),
  });
  const signature = signPayload(SISU_AUTHORIZE_URL, '', payload, keyPair, timestamp).toString('base64');
  const headers = { 'x-xbl-contract-version': '1', 'Cache-Control': 'no-store, must-revalidate, no-cache', 'MS-CV': cv, Signature: signature };
  const res = await httpRequest(SISU_AUTHORIZE_URL, 'POST', payload, headers);
  return {
    titleToken: { token: res.data.TitleToken.Token, notAfter: res.data.TitleToken.NotAfter },
    userToken: { token: res.data.UserToken.Token, notAfter: res.data.UserToken.NotAfter },
  };
}

async function getXSTS(deviceToken, titleToken, userToken, jwk, keyPair, cv, timestamp) {
  const payload = JSON.stringify({
    RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT',
    Properties: { SandboxId: 'RETAIL', UserTokens: [userToken], DeviceToken: deviceToken, TitleToken: titleToken, ProofKey: jwk },
  });
  const signature = signPayload(XSTS_AUTH_URL, '', payload, keyPair, timestamp).toString('base64');
  const headers = { 'x-xbl-contract-version': '1', 'Content-Type': 'application/json', 'Cache-Control': 'no-store, must-revalidate, no-cache', 'MS-CV': cv, Signature: signature };
  const res = await httpRequest(XSTS_AUTH_URL, 'POST', payload, headers);
  const { Token: xstsToken, DisplayClaims } = res.data;
  return { userHash: DisplayClaims.xui[0].uhs, xblXsts: xstsToken };
}

async function mcLogin(userHash, xstsToken) {
  const payload = JSON.stringify({ platform: 'PC_LAUNCHER', xtoken: `XBL3.0 x=${userHash};${xstsToken}` });
  const res = await httpRequest(MC_LOGIN_URL, 'POST', payload, { 'Accept': 'application/json', 'Content-Type': 'application/json' });
  if (res.status !== 200) throw new Error('Minecraft login failed');
  return { accessToken: res.data.access_token, expiresIn: res.data.expires_in };
}

async function checkOwnership(token) {
  const res = await httpRequest(MC_ENTITLEMENTS_URL, 'GET', null, { 'Authorization': `Bearer ${token}` });
  if (res.status !== 200) throw new Error('Entitlements check failed');
  return res.data.items.some(i => i.name === 'product_minecraft' || i.name === 'game_minecraft');
}

async function getProfile(token) {
  const res = await httpRequest(MC_PROFILE_URL, 'GET', null, { 'Authorization': `Bearer ${token}` });
  if (res.status !== 200) throw new Error('Profile fetch failed');
  return { username: res.data.name, uuid: res.data.id };
}

async function loginWithMicrosoft() {
  const codeVerifier = crypto.randomBytes(64).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest().toString('base64url');

  const { deviceToken, issueInstant, keyPair, jwk, correlationVector: cv } = await getSisuDeviceInfo();
  const { msaOauthRedirectUrl, sessionId } = await doSisuAuthenticate(deviceToken, keyPair, codeChallenge, cv, issueInstant);

  const { url, cancelled } = await initAuthWindow(msaOauthRedirectUrl);
  if (cancelled || !url) throw new Error('Login cancelled');

  const authCode = new URL(url).searchParams.get('code');
  if (!authCode) throw new Error('No auth code in response');

  const { accessToken: msAccessToken, refreshToken } = await getMsAccessToken(authCode, codeVerifier);
  const { titleToken, userToken } = await doSisuAuthorize(msAccessToken, deviceToken, jwk, keyPair, cv, sessionId, issueInstant);
  const { userHash, xblXsts } = await getXSTS(deviceToken, titleToken.token, userToken.token, jwk, keyPair, cv, issueInstant);
  const { accessToken: mcToken } = await mcLogin(userHash, xblXsts);

  const owns = await checkOwnership(mcToken);
  if (!owns) throw new Error('Account does not own Minecraft: Java Edition');

  const profile = await getProfile(mcToken);
  // Persist session for silent refresh (like Lunar's account.json)
  const sessionDir = path.join(app.getPath('userData'), 'sessions');
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'last.json'), JSON.stringify({
    refreshToken, deviceToken, jwk,
    keyPair: { privateKey: keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }), publicKey: keyPair.publicKey.export({ type: 'spki', format: 'pem' }) },
    cv, issueInstant, sessionId,
    // Save profile info so we can restore without re-login
    username: profile.username,
    uuid: profile.uuid,
  }));
  return { ...profile, accessToken: mcToken, refreshToken };
}

// --- Silent token refresh ---
let _refreshSession = null;

function loadRefreshSession() {
  try {
    const sessionPath = path.join(app.getPath('userData'), 'sessions', 'last.json');
    if (fs.existsSync(sessionPath)) {
      const d = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      _refreshSession = {
        ...d,
        keyPair: { privateKey: crypto.createPrivateKey(d.keyPair.privateKey) },
      };
    }
  } catch {}
}


async function refreshMinecraftToken() {
  if (!_refreshSession) throw new Error('No refresh session available');
  const { refreshToken, deviceToken, jwk, keyPair, cv, issueInstant, sessionId } = _refreshSession;

  // 1. Use Microsoft refresh token to get new MS access token (silent, no browser)
  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID);
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', refreshToken);
  params.append('redirect_uri', MS_REDIRECT_URL);
  params.append('scope', XBL_SCOPE);
  const tokenRes = await httpRequest(MS_AUTH_TOKEN_URL, 'POST', params.toString(), { 'Content-Type': 'application/x-www-form-urlencoded' });
  if (tokenRes.status !== 200) throw new Error('Refresh token exchange failed');
  const newRefreshToken = tokenRes.data.refresh_token;
  const newMsAccessToken = tokenRes.data.access_token;

  // 2. SISU Authorize with new MS token
  const { titleToken, userToken } = await doSisuAuthorize(newMsAccessToken, deviceToken, jwk, keyPair, cv, sessionId, issueInstant);

  // 3. XSTS
  const { userHash, xblXsts } = await getXSTS(deviceToken, titleToken.token, userToken.token, jwk, keyPair, cv, issueInstant);

  // 4. Minecraft login
  const { accessToken: mcToken } = await mcLogin(userHash, xblXsts);

  // Update stored refresh session
  _refreshSession.refreshToken = newRefreshToken;
  const sessionDir = path.join(app.getPath('userData'), 'sessions');
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
  const existing = JSON.parse(fs.readFileSync(path.join(sessionDir, 'last.json'), 'utf8'));
  existing.refreshToken = newRefreshToken;
  fs.writeFileSync(path.join(sessionDir, 'last.json'), JSON.stringify(existing));

  return { accessToken: mcToken };
}

async function checkSavedSession() {
  try {
    const sessionPath = path.join(app.getPath('userData'), 'sessions', 'last.json');
    if (!fs.existsSync(sessionPath)) return null;
    const d = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    if (!d.refreshToken || !d.username) return null;
    return { username: d.username, uuid: d.uuid };
  } catch { return null }
}

module.exports = { loginWithMicrosoft, refreshMinecraftToken, checkSavedSession, loadRefreshSession };
