import fs from 'node:fs';
import readline from 'node:readline';
import { pipeline } from 'node:stream/promises';

export async function* readReplayEvents(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    yield JSON.parse(trimmed);
  }
}

export async function streamReplayFile(filePath, res) {
  const stat = await fs.promises.stat(filePath);
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Content-Length': stat.size,
  });
  const readStream = fs.createReadStream(filePath);
  await pipeline(readStream, res);
}