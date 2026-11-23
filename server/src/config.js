import path from 'node:path';

function parsePositiveInt(raw, fallback, name) {
  if (raw === undefined || raw === '') return fallback;
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`Invalid env ${name}="${raw}": expected positive integer`);
  }
  return num;
}

export function loadConfig(env = process.env) {
  const port = parsePositiveInt(env.PORT, 3000, 'PORT');
  if (port > 65535) {
    throw new Error(`Invalid PORT=${port}`);
  }

  const host = (env.HOST || '0.0.0.0').trim();
  if (!host) {
    throw new Error('HOST cannot be empty');
  }

  const rawLogDir = (env.LOG_DIR || './logs').trim();
  if (!rawLogDir) {
    throw new Error('LOG_DIR cannot be empty');
  }

  return Object.freeze({
    port,
    host,
    logDir: path.resolve(process.cwd(), rawLogDir),
    maxRooms: parsePositiveInt(env.MAX_ROOMS, 20, 'MAX_ROOMS'),
    maxPlayersPerRoom: parsePositiveInt(env.MAX_PLAYERS_PER_ROOM, 6, 'MAX_PLAYERS_PER_ROOM'),
    maxPayloadBytes: parsePositiveInt(env.MAX_PAYLOAD_BYTES, 16384, 'MAX_PAYLOAD_BYTES'),
    rateLimitPerSec: parsePositiveInt(env.RATE_LIMIT_PER_SEC, 20, 'RATE_LIMIT_PER_SEC'),
    slowClientBufferBytes: parsePositiveInt(
      env.SLOW_CLIENT_BUFFER_BYTES,
      65536,
      'SLOW_CLIENT_BUFFER_BYTES'
    ),
  });
}