import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

const certPath = path.join(__dirname, 'localhost.pem');
const keyPath  = path.join(__dirname, 'localhost-key.pem');

if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  console.error('\n  ❌ TLS cert not found. Run inside spike/:\n');
  console.error('     mkcert -install');
  console.error('     mkcert localhost\n');
  process.exit(1);
}

const server = https.createServer(
  { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
  (req, res) => {
    // Serve index.html for all routes so the OAuth redirect (?code=...) is
    // handled by the SPA instead of returning a 404.
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }
);

server.listen(PORT, () => {
  console.log(`\n  Spike server → https://localhost:${PORT}\n`);
  console.log('  Open that URL in Chrome or Edge (not Firefox).');
  console.log('  Make sure https://localhost:3000/ is added as a');
  console.log('  Redirect URI in your Spotify Developer Dashboard.\n');
});
