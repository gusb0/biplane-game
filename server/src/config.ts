import path from "node:path";
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().trim().min(1).default("0.0.0.0"),
  LOG_DIR: z.string().trim().min(1).default("./logs"),
  MAX_ROOMS: z.coerce.number().int().min(1).max(500).default(20),
  MAX_PLAYERS_PER_ROOM: z.coerce.number().int().min(1).max(16).default(6),
  MAX_PAYLOAD_BYTES: z.coerce.number().int().min(256).max(1_048_576).default(16384),
  RATE_LIMIT_PER_SEC: z.coerce.number().int().min(1).max(500).default(20),
  SLOW_CLIENT_BUFFER_BYTES: z.coerce.number().int().min(1024).max(10_000_000).default(65536),
});

export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly logDir: string;
  readonly maxRooms: number;
  readonly maxPlayersPerRoom: number;
  readonly maxPayloadBytes: number;
  readonly rateLimitPerSec: number;
  readonly slowClientBufferBytes: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  const d = parsed.data;
  return {
    port: d.PORT,
    host: d.HOST,
    logDir: path.resolve(process.cwd(), d.LOG_DIR),
    maxRooms: d.MAX_ROOMS,
    maxPlayersPerRoom: d.MAX_PLAYERS_PER_ROOM,
    maxPayloadBytes: d.MAX_PAYLOAD_BYTES,
    rateLimitPerSec: d.RATE_LIMIT_PER_SEC,
    slowClientBufferBytes: d.SLOW_CLIENT_BUFFER_BYTES,
  };
}