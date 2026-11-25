import { MSG, PROTOCOL_VERSION } from "./protocol.js";
import { normalizeAngle } from "./sim.js";
import { asEntityId, asPlayerSlot, asSeq, asTick } from "./types.js";
import type {
  AsteroidSnapshot,
  BulletSnapshot,
  PlayerInput,
  ShipSnapshot,
  SnapshotMessage,
} from "./types.js";

/**
 * BINARY PROTOCOL SPECIFICATION (Little-Endian everywhere, v1)
 *
 * Input (11 bytes):
 *   0: msgType (Uint8 = 1)
 *   1: version (Uint8 = 1)
 *   2..5: seq (Uint32 LE)
 *   6..9: tick (Uint32 LE)
 *   10: flags (Uint8: 1=thrust, 2=brake, 4=left, 8=right, 16=fire)
 *
 * Snapshot (18 + ships*20 + bullets*11 + asteroids*11 bytes):
 *   Header (18B): 0=type(2), 1=ver(1), 2..5=tick(u32), 6..9=lastProcessedSeq(u32),
 *                 10..13=serverTimeMs(f32), 14=shipCount(u8), 15=bulletCount(u8),
 *                 16=asteroidCount(u8), 17=yourSlot(u8)
 *   Ship (20B):   +0=slot(u8), +1=aliveFlag(u8), +2..3=hp(u16), +4..5=score(u16),
 *                 +6..9=x(f32), +10..13=y(f32), +14..15=angle*1000(i16),
 *                 +16..17=vx*10(i16), +18..19=vy*10(i16)
 *   Bullet (11B): +0..1=id(u16), +2=ownerSlot(u8), +3..6=x(f32), +7..10=y(f32)
 *   Asteroid(11B):+0..1=id(u16), +2=radius(u8), +3..6=x(f32), +7..10=y(f32)
 */

export interface WireCodec {
  readonly name: "binary" | "json";
  encodeInput(input: PlayerInput): ArrayBuffer | string;
  decodeSnapshot(payload: ArrayBuffer | string): SnapshotMessage;
}

export function encodeInputBinary(input: PlayerInput): ArrayBuffer {
  const buf = new ArrayBuffer(11);
  const view = new DataView(buf);
  view.setUint8(0, MSG.INPUT);
  view.setUint8(1, PROTOCOL_VERSION);
  view.setUint32(2, Number(input.seq) >>> 0, true);
  view.setUint32(6, (Number(input.tick) || 0) >>> 0, true);

  let flags = 0;
  if (input.thrust) flags |= 1;
  if (input.brake) flags |= 2;
  if (input.left) flags |= 4;
  if (input.right) flags |= 8;
  if (input.fire) flags |= 16;
  view.setUint8(10, flags);
  return buf;
}

export function decodeInputBinary(bufferLike: ArrayBuffer | ArrayBufferView): PlayerInput {
  const view = toDataView(bufferLike);
  if (view.byteLength !== 11) {
    throw new Error(`Invalid input binary length: expected 11, got ${view.byteLength}`);
  }
  const msgType = view.getUint8(0);
  const version = view.getUint8(1);
  if (msgType !== MSG.INPUT) {
    throw new Error(`Expected INPUT msgType (${MSG.INPUT}), got ${msgType}`);
  }
  if (version !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported binary protocol version: ${version}`);
  }

  const seq = asSeq(view.getUint32(2, true));
  const tick = asTick(view.getUint32(6, true));
  const flags = view.getUint8(10);

  return {
    seq,
    tick,
    thrust: (flags & 1) !== 0,
    brake: (flags & 2) !== 0,
    left: (flags & 4) !== 0,
    right: (flags & 8) !== 0,
    fire: (flags & 16) !== 0,
  };
}

export function encodeSnapshotBinary(snapshot: Omit<SnapshotMessage, "type" | "v">): ArrayBuffer {
  const ships = snapshot.ships;
  const bullets = snapshot.bullets;
  const asteroids = snapshot.asteroids;
  const totalBytes = 18 + ships.length * 20 + bullets.length * 11 + asteroids.length * 11;

  const buf = new ArrayBuffer(totalBytes);
  const view = new DataView(buf);

  view.setUint8(0, MSG.SNAPSHOT);
  view.setUint8(1, PROTOCOL_VERSION);
  view.setUint32(2, Number(snapshot.tick) >>> 0, true);
  view.setUint32(6, (Number(snapshot.lastProcessedSeq) || 0) >>> 0, true);
  view.setFloat32(10, Number(snapshot.serverTimeMs) || 0, true);
  view.setUint8(14, ships.length);
  view.setUint8(15, bullets.length);
  view.setUint8(16, asteroids.length);
  view.setUint8(17, Number(snapshot.yourSlot) & 0xff);

  let offset = 18;

  for (const s of ships) {
    view.setUint8(offset, Number(s.slot) & 0xff);
    view.setUint8(offset + 1, s.alive ? 1 : 0);
    view.setUint16(offset + 2, Math.max(0, Math.min(65535, Math.round(s.hp))), true);
    view.setUint16(offset + 4, Math.max(0, Math.min(65535, Math.round(s.score))), true);
    view.setFloat32(offset + 6, s.x, true);
    view.setFloat32(offset + 10, s.y, true);
    const quantAngle = Math.round(normalizeAngle(s.angle) * 1000);
    view.setInt16(offset + 14, Math.max(-32768, Math.min(32767, quantAngle)), true);
    view.setInt16(offset + 16, Math.max(-32768, Math.min(32767, Math.round((s.vx || 0) * 10))), true);
    view.setInt16(offset + 18, Math.max(-32768, Math.min(32767, Math.round((s.vy || 0) * 10))), true);
    offset += 20;
  }

  for (const b of bullets) {
    view.setUint16(offset, Number(b.id) & 0xffff, true);
    view.setUint8(offset + 2, Number(b.ownerSlot) & 0xff);
    view.setFloat32(offset + 3, b.x, true);
    view.setFloat32(offset + 7, b.y, true);
    offset += 11;
  }

  for (const a of asteroids) {
    view.setUint16(offset, Number(a.id) & 0xffff, true);
    view.setUint8(offset + 2, Math.max(0, Math.min(255, Math.round(a.radius))));
    view.setFloat32(offset + 3, a.x, true);
    view.setFloat32(offset + 7, a.y, true);
    offset += 11;
  }

  return buf;
}

export function decodeSnapshotBinary(bufferLike: ArrayBuffer | ArrayBufferView): SnapshotMessage {
  const view = toDataView(bufferLike);
  if (view.byteLength < 18) {
    throw new Error(`Snapshot binary packet too short: ${view.byteLength}`);
  }
  const msgType = view.getUint8(0);
  const version = view.getUint8(1);
  if (msgType !== MSG.SNAPSHOT) {
    throw new Error(`Expected SNAPSHOT msgType (${MSG.SNAPSHOT}), got ${msgType}`);
  }
  if (version !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported binary snapshot version: ${version}`);
  }

  const tick = asTick(view.getUint32(2, true));
  const lastProcessedSeq = asSeq(view.getUint32(6, true));
  const serverTimeMs = view.getFloat32(10, true);
  const shipCount = view.getUint8(14);
  const bulletCount = view.getUint8(15);
  const asteroidCount = view.getUint8(16);
  const yourSlot = asPlayerSlot(view.getUint8(17));

  const expectedBytes = 18 + shipCount * 20 + bulletCount * 11 + asteroidCount * 11;
  if (view.byteLength !== expectedBytes) {
    throw new Error(`Snapshot byte length mismatch: got ${view.byteLength}, expected ${expectedBytes}`);
  }

  let offset = 18;
  const ships: ShipSnapshot[] = [];
  for (let i = 0; i < shipCount; i++) {
    const slot = asPlayerSlot(view.getUint8(offset));
    const flags = view.getUint8(offset + 1);
    const hp = view.getUint16(offset + 2, true);
    const score = view.getUint16(offset + 4, true);
    const x = view.getFloat32(offset + 6, true);
    const y = view.getFloat32(offset + 10, true);
    const angle = view.getInt16(offset + 14, true) / 1000;
    const vx = view.getInt16(offset + 16, true) / 10;
    const vy = view.getInt16(offset + 18, true) / 10;
    ships.push({
      kind: "ship",
      slot,
      alive: (flags & 1) !== 0,
      hp,
      maxHp: 100,
      score,
      x,
      y,
      angle,
      vx,
      vy,
    });
    offset += 20;
  }

  const bullets: BulletSnapshot[] = [];
  for (let i = 0; i < bulletCount; i++) {
    bullets.push({
      kind: "bullet",
      id: asEntityId(view.getUint16(offset, true)),
      ownerSlot: asPlayerSlot(view.getUint8(offset + 2)),
      x: view.getFloat32(offset + 3, true),
      y: view.getFloat32(offset + 7, true),
    });
    offset += 11;
  }

  const asteroids: AsteroidSnapshot[] = [];
  for (let i = 0; i < asteroidCount; i++) {
    asteroids.push({
      kind: "asteroid",
      id: asEntityId(view.getUint16(offset, true)),
      radius: view.getUint8(offset + 2),
      x: view.getFloat32(offset + 3, true),
      y: view.getFloat32(offset + 7, true),
    });
    offset += 11;
  }

  return {
    type: "snapshot",
    v: PROTOCOL_VERSION,
    tick,
    lastProcessedSeq,
    serverTimeMs,
    yourSlot,
    ships,
    bullets,
    asteroids,
  };
}

function toDataView(bufferLike: ArrayBuffer | ArrayBufferView): DataView {
  if (bufferLike instanceof ArrayBuffer) {
    return new DataView(bufferLike);
  }
  if (ArrayBuffer.isView(bufferLike)) {
    return new DataView(bufferLike.buffer, bufferLike.byteOffset, bufferLike.byteLength);
  }
  throw new Error("Expected ArrayBuffer or ArrayBufferView");
}