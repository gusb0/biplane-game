import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { RoomManager } from './rooms.js';
import { attachMatchLogger } from './log/matchlog.js';
import { streamReplayFile } from './log/replay.js';
import { setupWebSocketServer } from './ws.js';

const config = loadConfig();
const clientDistDir = fileURLToPath(new URL('../../client/dist', import.meta.url));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const matchLoggers = new Map();

const roomManager = new RoomManager({
  maxRooms: config.maxRooms,
  defaultMaxPlayers: config.maxPlayersPerRoom,
  onRoomCreated: (room) => {
    const logger = attachMatchLogger(room, config.logDir);
    matchLoggers.set(room.id, logger);
  },
});

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readJsonBody(req, maxBytes = 8192) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.byteLength;
      if (total > maxBytes) {
        const err = new Error('Request body too large');
        err.status = 413;
        req.destroy(err);
        reject(err);
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        const err = new Error('Invalid JSON body');
        err.status = 400;
        reject(err);
      }
    });

    req.on('error', reject);
  });
}

function resolveSafePath(baseDir, unsafeRelPath) {
  const decoded = decodeURIComponent(unsafeRelPath);
  if (decoded.includes('\0') || decoded.includes('..')) {
    return null;
  }
  const resolved = path.resolve(baseDir, `.${decoded}`);
  if (resolved !== baseDir && !resolved.startsWith(baseDir + path.sep)) {
    return null;
  }
  return resolved;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (req.method === 'GET' && pathname === '/health') {
      sendJson(res, 200, {
        status: 'ok',
        uptimeSec: Math.round(process.uptime()),
        rooms: roomManager.size,
        rssMb: Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10,
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/rooms') {
      sendJson(res, 200, { rooms: roomManager.listRooms() });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/rooms') {
      const body = await readJsonBody(req, 8192);
      const room = roomManager.createRoom({
        name: body.name,
        maxPlayers: body.maxPlayers,
        arena: body.arena,
      });
      sendJson(res, 201, { room: room.toJSON() });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/replays') {
      fs.mkdirSync(config.logDir, { recursive: true });
      const files = (await fs.promises.readdir(config.logDir)).filter((f) => f.endsWith('.ndjson'));
      sendJson(res, 200, { replays: files });
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/api/replays/')) {
      const id = pathname.slice('/api/replays/'.length);
      if (!/^[a-zA-Z0-9._-]+\.ndjson$/.test(id)) {
        sendJson(res, 400, { error: 'Invalid replay filename' });
        return;
      }
      const filePath = resolveSafePath(config.logDir, `/${id}`);
      if (!filePath || !fs.existsSync(filePath)) {
        sendJson(res, 404, { error: 'Replay not found' });
        return;
      }
      await streamReplayFile(filePath, res);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/slow') {
      const end = performance.now() + 300;
      while (performance.now() < end) {}
      sendJson(res, 200, { blockedMs: 300 });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    const requestedPath = pathname === '/' ? '/index.html' : pathname;
    const safeFilePath = resolveSafePath(clientDistDir, requestedPath);

    if (!safeFilePath) {
      sendJson(res, 403, { error: 'Forbidden path traversal' });
      return;
    }

    if (!fs.existsSync(clientDistDir)) {
      sendJson(res, 503, {
        error: 'Client is not built yet. Run "npm run build" or open Vite on port 5173.',
      });
      return;
    }

    let fileToServe = safeFilePath;
    if (!fs.existsSync(fileToServe) || fs.statSync(fileToServe).isDirectory()) {
      fileToServe = path.join(clientDistDir, 'index.html');
    }

    const ext = path.extname(fileToServe);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const stat = await fs.promises.stat(fileToServe);

    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    fs.createReadStream(fileToServe).pipe(res);
  } catch (err) {
    const status = err?.status || 500;
    if (!res.headersSent) {
      sendJson(res, status, { error: err?.message || 'Internal Server Error' });
    }
  }
});

server.on('error', (err) => {
  console.error('[http] Server error:', err);
});

const { closeAllSockets } = setupWebSocketServer(server, { roomManager, config });

server.listen(config.port, config.host, () => {
  console.log(`[server] Listening on http://${config.host}:${config.port} (logs: ${config.logDir})`);
});

let shuttingDown = false;
async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[server] Received ${signal}, shutting down gracefully...`);

  await closeAllSockets();
  roomManager.closeAll();
  await Promise.allSettled(Array.from(matchLoggers.values()).map((l) => l.stop()));

  await new Promise((resolve) => server.close(resolve));
  console.log('[server] Clean exit (code 0).');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));