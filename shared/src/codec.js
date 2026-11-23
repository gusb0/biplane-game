import { MSG, PROTOCOL_VERSION } from './protocol.js';
import { normalizeAngle } from './sim.js';

/**
 * BINARY PROTOCOL SPECIFICATION (Little-Endian everywhere, v1)
 *
 * 1) Client -> Server INPUT packet (11 bytes fixed):
 *    Offset | Type   | Field
 *    -------+--------+-------------------------------------------------------
 *    0      | Uint8  | msgType = 1 (MSG.INPUT)
 *    1      | Uint8  | version = 1
 *    2..5   | Uint32 | seq (client monotonic input sequence number)
 *    6..9   | Uint32 | tick (client simulation tick)
 *    10     | Uint8  | flags bitmask: 1=thrust, 2=brake, 4=left, 8=right, 16=fire
 *
 * 2) Server -> Client SNAPSHOT packet (18 + ships*20 + bullets*11 + asteroids*11 bytes):
 *    Header (18 bytes):
 *    0      | Uint8  | msgType = 2 (MSG.SNAPSHOT)
 *    1      | Uint8  | version = 1
 *    2..5   | Uint32 | tick (server authoritative tick)
 *    6..9   | Uint32 | lastProcessedSeq (for recipient client)
 *    10..13 | Float32| serverTimeMs (server monotonic timestamp)
 *    14     | Uint8  | shipCount
 *    15     | Uint8  | bulletCount
 *    16     | Uint8  | asteroidCount
 *    17     | Uint8  | yourSlot
 *
 *    Ship entry (20 bytes each):
 *    +0     | Uint8  | slot
 *    +1     | Uint8  | flags (bit0 = alive)
 *    +2..3  | Uint16 | hp
 *    +4..5  | Uint16 | score
 *    +6..9  | Float32| x
 *    +10..13| Float32| y
 *    +14..15| Int16  | angle quantized in 1/1000 rad (precision ~0.057 deg)
 *    +16..17| Int16  | vx quantized in 0.1 px/s
 *    +18..19| Int16  | vy quantized in 0.1 px/s
 *
 *    Bullet entry (11 bytes each):
 *    +0..1  | Uint16 | id
 *    +2     | Uint8  | ownerSlot
 *    +3..6  | Float32| x
 *    +7..10 | Float32| y
 *
 *    Asteroid entry (11 bytes each):
 *    +0..1  | Uint16 | id
 *    +2     | Uint8  | radius
 *    +3..6  | Float32| x
 *    +7..10 | Float32| y
 */

export function encodeInputBinary(input) {
  const buf = new ArrayBuffer(11);
  const view = new DataView(buf);
  view.setUint8(0, MSG.INPUT);
  view.setUint8(1, PROTOCOL_VERSION);
  view.setUint32(2, input.seq >>> 0, true);
  view.setUint32(6, (input.tick || 0) >>> 0, true);

  let flags = 0;
  if (input.thrust) flags |= 1;
  if (input.brake) flags |= 2;
  if (input.left) flags |= 4;
  if (input.right) flags |= 8;
  if (input.fire) flags |= 16;
  view.setUint8(10, flags);
  return buf;
}

export function decodeInputBinary(bufferLike) {
  const view = toDataView(bufferLike);
  if (view.byteLength < 11) {
    throw new Error(`Input binary packet too short: ${view.byteLength}`);
  }
  const msgType = view.getUint8(0);
  const version = view.getUint8(1);
  if (msgType !== MSG.INPUT || version !== PROTOCOL_VERSION) {
    throw new Error(`Invalid input header: type=${msgType}, v=${version}`);
  }
  const seq = view.getUint32(2, true);
  const tick = view.getUint32(6, true);
  const flags = view.getUint8(10);

  return {
    type: 'input',
    v: version,
    seq,
    tick,
    thrust: (flags & 1) !== 0,
    brake: (flags & 2) !== 0,
    left: (flags & 4) !== 0,
    right: (flags & 8) !== 0,
    fire: (flags & 16) !== 0,
  };
}

export function encodeSnapshotBinary(snapshot) {
  const ships = snapshot.ships || [];
  const bullets = snapshot.bullets || [];
  const asteroids = snapshot.asteroids || [];
  const totalBytes = 18 + ships.length * 20 + bullets.length * 11 + asteroids.length * 11;

  const buf = new ArrayBuffer(totalBytes);
  const view = new DataView(buf);

  view.setUint8(0, MSG.SNAPSHOT);
  view.setUint8(1, PROTOCOL_VERSION);
  view.setUint32(2, snapshot.tick >>> 0, true);
  view.setUint32(6, (snapshot.lastProcessedSeq || 0) >>> 0, true);
  view.setFloat32(10, Number(snapshot.serverTimeMs) || 0, true);
  view.setUint8(14, ships.length);
  view.setUint8(15, bullets.length);
  view.setUint8(16, asteroids.length);
  view.setUint8(17, snapshot.yourSlot ?? 255);

  let offset = 18;

  for (const s of ships) {
    view.setUint8(offset, s.slot);
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
    view.setUint16(offset, b.id & 0xffff, true);
    view.setUint8(offset + 2, b.ownerSlot);
    view.setFloat32(offset + 3, b.x, true);
    view.setFloat32(offset + 7, b.y, true);
    offset += 11;
  }

  for (const a of asteroids) {
    view.setUint16(offset, a.id & 0xffff, true);
    view.setUint8(offset + 2, Math.round(a.radius));
    view.setFloat32(offset + 3, a.x, true);
    view.setFloat32(offset + 7, a.y, true);
    offset += 11;
  }

  return buf;
}

export function decodeSnapshotBinary(bufferLike) {
  const view = toDataView(bufferLike);
  if (view.byteLength < 18) {
    throw new Error(`Snapshot binary packet too short: ${view.byteLength}`);
  }
  const msgType = view.getUint8(0);
  const version = view.getUint8(1);
  if (msgType !== MSG.SNAPSHOT || version !== PROTOCOL_VERSION) {
    throw new Error(`Invalid snapshot header: type=${msgType}, v=${version}`);
  }

  const tick = view.getUint32(2, true);
  const lastProcessedSeq = view.getUint32(6, true);
  const serverTimeMs = view.getFloat32(10, true);
  const shipCount = view.getUint8(14);
  const bulletCount = view.getUint8(15);
  const asteroidCount = view.getUint8(16);
  const yourSlot = view.getUint8(17);

  const expectedBytes = 18 + shipCount * 20 + bulletCount * 11 + asteroidCount * 11;
  if (view.byteLength < expectedBytes) {
    throw new Error(`Truncated snapshot: got ${view.byteLength}, expected ${expectedBytes}`);
  }

  let offset = 18;
  const ships = [];
  for (let i = 0; i < shipCount; i++) {
    const slot = view.getUint8(offset);
    const flags = view.getUint8(offset + 1);
    const hp = view.getUint16(offset + 2, true);
    const score = view.getUint16(offset + 4, true);
    const x = view.getFloat32(offset + 6, true);
    const y = view.getFloat32(offset + 10, true);
    const angle = view.getInt16(offset + 14, true) / 1000;
    const vx = view.getInt16(offset + 16, true) / 10;
    const vy = view.getInt16(offset + 18, true) / 10;
    ships.push({
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

  const bullets = [];
  for (let i = 0; i < bulletCount; i++) {
    bullets.push({
      id: view.getUint16(offset, true),
      ownerSlot: view.getUint8(offset + 2),
      x: view.getFloat32(offset + 3, true),
      y: view.getFloat32(offset + 7, true),
    });
    offset += 11;
  }

  const asteroids = [];
  for (let i = 0; i < asteroidCount; i++) {
    asteroids.push({
      id: view.getUint16(offset, true),
      radius: view.getUint8(offset + 2),
      x: view.getFloat32(offset + 3, true),
      y: view.getFloat32(offset + 7, true),
    });
    offset += 11;
  }

  return {
    type: 'snapshot',
    v: version,
    tick,
    lastProcessedSeq,
    serverTimeMs,
    yourSlot,
    ships,
    bullets,
    asteroids,
  };
}

function toDataView(bufferLike) {
  if (bufferLike instanceof ArrayBuffer) {
    return new DataView(bufferLike);
  }
  if (ArrayBuffer.isView(bufferLike)) {
    return new DataView(bufferLike.buffer, bufferLike.byteOffset, bufferLike.byteLength);
  }
  throw new Error('Expected ArrayBuffer or ArrayBufferView');
}