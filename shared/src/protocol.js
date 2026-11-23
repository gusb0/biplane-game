export const PROTOCOL_VERSION = 1;
export const SERVER_TICK_RATE = 30;
export const FIXED_DT = 1 / SERVER_TICK_RATE;

export const MSG = Object.freeze({
  INPUT: 1,
  SNAPSHOT: 2,
  PING: 3,
  PONG: 4,
});

export function sanitizeInput(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const seq = Number(raw.seq);
  const tick = Number(raw.tick) || 0;
  if (!Number.isInteger(seq) || seq < 0 || seq > 0xffffffff) {
    return null;
  }
  return {
    seq,
    tick: tick >>> 0,
    thrust: Boolean(raw.thrust),
    brake: Boolean(raw.brake),
    left: Boolean(raw.left),
    right: Boolean(raw.right),
    fire: Boolean(raw.fire),
  };
}