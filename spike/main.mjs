import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CLIENT_ID = 'dcf057d865ea421cbeebea7a0f190435';
const REDIRECT_URI = 'party-display://callback';
const SCOPES = 'streaming user-read-email user-read-private';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win;
let pkceVerifier;

function generateVerifier() {
  return crypto.randomBytes(64).toString('base64url').slice(0, 128);
}

async function generateChallenge(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return Buffer.from(hash).toString('base64url');
}

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.openDevTools({ mode: 'detach' });
});

app.on('window-all-closed', () => app.quit());

ipcMain.handle('start-login', async () => {
  pkceVerifier = generateVerifier();
  const challenge = await generateChallenge(pkceVerifier);

  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('scope', SCOPES);

  // Load auth page inside Electron — intercept redirect internally
  win.loadURL(authUrl.toString());

  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('party-display://')) {
      event.preventDefault();
      handleCallback(url);
      win.loadFile(path.join(__dirname, 'index.html'));
    }
  });
});

async function handleCallback(url) {
  const parsed = new URL(url);
  const code = parsed.searchParams.get('code');
  const error = parsed.searchParams.get('error');

  let result;

  if (error || !code) {
    result = { error: error || 'No code received' };
  } else {
    try {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        code_verifier: pkceVerifier,
      });

      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      const json = await res.json();
      if (!json.access_token) throw new Error(JSON.stringify(json));
      result = { token: json.access_token };
    } catch (e) {
      result = { error: e.message };
    }
  }

  // Wait for the reloaded page to finish loading before sending the token,
  // otherwise the IPC message arrives before the listener is registered.
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('auth-result', result);
  });
}
