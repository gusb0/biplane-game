import { z } from "zod";
import { asEntityId, asPlayerSlot, asSeq, asTick } from "./types.js";
import type { ParseResult, PlayerInput, SnapshotMessage } from "./types.js";

export const PROTOCOL_VERSION = 1 as const;
export const SERVER_TICK_RATE = 30 as const;
export const FIXED_DT = 1 / SERVER_TICK_RATE;

export const MSG = {
  INPUT: 1,
  SNAPSHOT: 2,
  PING: 3,
  PONG: 4,
} as const;

export type MessageKindByte = (typeof MSG)[keyof typeof MSG];

export const JoinMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION).optional(),
  type: z.literal("join"),
  roomId: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
  name: z.string().trim().min(1).max(20),
});

export const LeaveMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION).optional(),
  type: z.literal("leave"),
});

export const ChatMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION).optional(),
  type: z.literal("chat"),
  text: z.string().trim().min(1).max(200),
});

export const PingMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION).optional(),
  type: z.literal("ping"),
  t: z.number().finite(),
});

export const InputMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION).optional(),
  type: z.literal("input"),
  seq: z.number().int().nonnegative().max(0xffffffff),
  tick: z.number().int().nonnegative().max(0xffffffff),
  thrust: z.boolean(),
  brake: z.boolean(),
  left: z.boolean(),
  right: z.boolean(),
  fire: z.boolean(),
});

export const NetConfigMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION).optional(),
  type: z.literal("net_config"),
  codec: z.enum(["binary", "json"]).optional(),
  delayMs: z.number().finite().min(0).max(2000).optional(),
  jitterMs: z.number().finite().min(0).max(1000).optional(),
  dropRate: z.number().finite().min(0).max(0.9).optional(),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  JoinMessageSchema,
  LeaveMessageSchema,
  ChatMessageSchema,
  PingMessageSchema,
  InputMessageSchema,
  NetConfigMessageSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const ShipSnapshotSchema = z.object({
  kind: z.literal("ship").optional(),
  slot: z.number().int().nonnegative(),
  alive: z.boolean(),
  hp: z.number().finite(),
  maxHp: z.number().finite(),
  score: z.number().finite(),
  x: z.number().finite(),
  y: z.number().finite(),
  angle: z.number().finite(),
  vx: z.number().finite(),
  vy: z.number().finite(),
  name: z.string().optional(),
});

export const BulletSnapshotSchema = z.object({
  kind: z.literal("bullet").optional(),
  id: z.number().int().nonnegative(),
  ownerSlot: z.number().int().nonnegative(),
  x: z.number().finite(),
  y: z.number().finite(),
});

export const AsteroidSnapshotSchema = z.object({
  kind: z.literal("asteroid").optional(),
  id: z.number().int().nonnegative(),
  radius: z.number().finite(),
  x: z.number().finite(),
  y: z.number().finite(),
});

export const SnapshotJsonSchema = z.object({
  v: z.literal(PROTOCOL_VERSION).optional(),
  type: z.enum(["snapshot", "snapshot_json"]),
  tick: z.number().int().nonnegative(),
  lastProcessedSeq: z.number().int().nonnegative(),
  serverTimeMs: z.number().finite(),
  yourSlot: z.number().int().nonnegative(),
  ships: z.array(ShipSnapshotSchema),
  bullets: z.array(BulletSnapshotSchema),
  asteroids: z.array(AsteroidSnapshotSchema),
});

export function parseClientMessage(data: unknown): ParseResult<ClientMessage> {
  const result = ClientMessageSchema.safeParse(data);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; "),
    };
  }
  return { ok: true, value: result.data };
}

export function parseSnapshotJson(data: unknown): ParseResult<SnapshotMessage> {
  const result = SnapshotJsonSchema.safeParse(data);
  if (!result.success) {
    return { ok: false, error: result.error.message };
  }
  const d = result.data;
  return {
    ok: true,
    value: {
      type: "snapshot",
      v: PROTOCOL_VERSION,
      tick: asTick(d.tick),
      lastProcessedSeq: asSeq(d.lastProcessedSeq),
      serverTimeMs: d.serverTimeMs,
      yourSlot: asPlayerSlot(d.yourSlot),
      ships: d.ships.map((s) => ({
        kind: "ship",
        slot: asPlayerSlot(s.slot),
        alive: s.alive,
        hp: s.hp,
        maxHp: s.maxHp,
        score: s.score,
        x: s.x,
        y: s.y,
        angle: s.angle,
        vx: s.vx,
        vy: s.vy,
        ...(s.name !== undefined ? { name: s.name } : {}),
      })),
      bullets: d.bullets.map((b) => ({
        kind: "bullet",
        id: asEntityId(b.id),
        ownerSlot: asPlayerSlot(b.ownerSlot),
        x: b.x,
        y: b.y,
      })),
      asteroids: d.asteroids.map((a) => ({
        kind: "asteroid",
        id: asEntityId(a.id),
        radius: a.radius,
        x: a.x,
        y: a.y,
      })),
    },
  };
}

export function sanitizeInput(raw: unknown): PlayerInput | null {
  const parsed = InputMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  return {
    seq: asSeq(parsed.data.seq),
    tick: asTick(parsed.data.tick),
    thrust: parsed.data.thrust,
    brake: parsed.data.brake,
    left: parsed.data.left,
    right: parsed.data.right,
    fire: parsed.data.fire,
  };
}