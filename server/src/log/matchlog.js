import fs from 'node:fs';
import path from 'node:path';
import events from 'node:events';
import { Transform, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export class NdjsonTransform extends Transform {
  constructor() {
    super({ objectMode: true });
  }

  _transform(eventObj, _encoding, callback) {
    try {
      callback(null, `${JSON.stringify(eventObj)}\n`);
    } catch (err) {
      callback(err);
    }
  }
}

export function attachMatchLogger(room, logDir) {
  fs.mkdirSync(logDir, { recursive: true });

  const fileName = `${room.id}-${Date.now()}.ndjson`;
  const filePath = path.join(logDir, fileName);
  const ac = new AbortController();

  const source = Readable.from(events.on(room, 'event', { signal: ac.signal }));
  const transform = new NdjsonTransform();
  const sink = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' });

  const donePromise = pipeline(source, transform, sink).catch((err) => {
    if (err?.name !== 'AbortError') {
      console.error(`[matchlog] Pipeline error for ${fileName}:`, err);
    }
  });

  const stop = async () => {
    if (!ac.signal.aborted) ac.abort();
    await donePromise;
  };

  room.once('closed', () => stop());

  return { fileName, filePath, stop, donePromise };
}