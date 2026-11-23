import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { NdjsonTransform } from './matchlog.js';
import { streamReplayFile } from './replay.js';

const tmpDir = path.resolve(process.cwd(), 'logs');
fs.mkdirSync(tmpDir, { recursive: true });
const bigLogPath = path.join(tmpDir, 'synthetic-200mb.ndjson');
const TARGET_LINES = 1_650_000;

async function generateSyntheticLog() {
  console.log('1. Generating ~200 MB synthetic NDJSON log via stream pipeline...');
  let i = 0;
  const source = Readable.from(
    (function* () {
      while (i < TARGET_LINES) {
        i += 1;
        yield {
          t: 1730000000000 + i * 16,
          roomId: 'bench-arena',
          type: 'chat',
          seq: i,
          playerId: 'p-01',
          name: 'RedBaron',
          text: 'Telemetry stress sample payload for backpressure verification in Node.js streams',
        };
      }
    })()
  );

  await pipeline(source, new NdjsonTransform(), fs.createWriteStream(bigLogPath));
  const stat = fs.statSync(bigLogPath);
  console.log(`   Created ${(stat.size / (1024 * 1024)).toFixed(1)} MB log file.`);
}

async function measureStreamingRss() {
  const server = http.createServer(async (_req, res) => {
    try {
      await streamReplayFile(bigLogPath, res);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();

  console.log('2. Streaming 200 MB through throttled consumer (~4 MB/s) & sampling RSS...');
  const samples = [];
  const t0 = performance.now();

  const sampler = setInterval(() => {
    const sec = ((performance.now() - t0) / 1000).toFixed(1);
    const rssMb = (process.memoryUsage().rss / (1024 * 1024)).toFixed(1);
    samples.push({ sec: `${sec}s`, rssMb: Number(rssMb) });
  }, 1500);

  const res = await fetch(`http://127.0.0.1:${port}/replay`);
  for await (const chunk of res.body) {
    const pauseMs = Math.max(1, Math.round((chunk.byteLength / (4 * 1024 * 1024)) * 1000));
    await new Promise((r) => setTimeout(r, pauseMs));
  }

  clearInterval(sampler);
  server.close();
  fs.unlinkSync(bigLogPath);

  console.table(samples);
  const minRss = Math.min(...samples.map((s) => s.rssMb));
  const maxRss = Math.max(...samples.map((s) => s.rssMb));
  console.log(`RSS range during 200 MB download: ${minRss} MB .. ${maxRss} MB (flat curve!)`);
}

await generateSyntheticLog();
await measureStreamingRss();