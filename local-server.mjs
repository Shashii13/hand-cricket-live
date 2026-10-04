import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { resolve, extname, sep } from 'node:path';
import { GameService, GameError } from './lib/game.mjs';
const base = fileURLToPath(new URL('./local-dist/', import.meta.url));
const service = new GameService();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/game' && req.method === 'POST') {
      if (req.headers.origin && req.headers.origin !== url.origin) return json(403, { error: 'Please play from the room page.' });
      if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'Expected JSON.' });
      let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 4096) return json(413, { error: 'Request too large.' }); }
      const body = JSON.parse(text);
      const data = body.action === 'create' ? service.create(body.name) : body.action === 'join' ? service.join(body.code, body.name, body.token) : service.act(body.code, body.token, body.action, body);
      return json(200, data);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: 'Method not allowed.' });
    const file = resolve(base, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(resolve(base) + sep)) return json(403, { error: 'Forbidden.' });
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'" });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (error instanceof GameError) return json(error.status, { error: error.message });
    if (error instanceof SyntaxError) return json(400, { error: 'Invalid request.' });
    if (error.code === 'ENOENT') return json(404, { error: 'Not found.' });
    console.error(error); json(500, { error: 'Something went wrong.' });
  }
});
// Ticking independently of connected clients keeps every timer authoritative.
const tick = setInterval(() => { for (const room of service.rooms.values()) service.advance(room); service.cleanup(); }, 50);
tick.unref();
const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => {
  console.log(`Hand Cricket Live is running.\nThis computer: http://localhost:${port}`);
  try {
    for (const list of Object.values(networkInterfaces())) for (const info of list || []) if (info.family === 'IPv4' && !info.internal) console.log(`Same Wi-Fi: http://${info.address}:${port}`);
  } catch { console.log('For phones, use this computer’s Wi-Fi IP address with the same port.'); }
  console.log('Keep this terminal open. Stop with Ctrl+C. Rooms reset when the server stops.');
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Stop the other server or set PORT.` : error.message); process.exit(1); });
