import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  server: {
    host: true,
    port: 5173,
  },
  plugins: [
    {
      name: 'biplane-mock-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url, 'http://localhost');

          const delayMs = Number(url.searchParams.get('delay') || 0);
          if (delayMs > 0) {
            await new Promise((r) => setTimeout(r, delayMs));
          }

          if (url.pathname === '/api/rooms') {
            const failMode = url.searchParams.get('fail');

            if (failMode === '404') {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Rooms endpoint not found' }));
              return;
            }

            if (failMode === '500') {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Temporary server error' }));
              return;
            }

            if (failMode === 'badjson') {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end('{ broken_json: [1, 2, ');
              return;
            }

            if (failMode === 'timeout') {
              await new Promise((r) => setTimeout(r, 10000));
            }

            const roomsPath = path.resolve(process.cwd(), 'public/api/rooms.json');
            const content = fs.readFileSync(roomsPath, 'utf8');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(content);
            return;
          }

          next();
        });
      },
    },
  ],
});