import type { SeededRng, WorldState } from "./types.js";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed = 1337): SeededRng {
  let state = seed >>> 0;
  return {
    getState(): number {
      return state >>> 0;
    },
    setState(nextState: number): void {
      state = nextState >>> 0;
    },
    next(): number {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(min: number, max: number): number {
      return min + (max - min) * this.next();
    },
  };
}

export function hashSimulationState(state: WorldState): string {
  let h = 2166136261 >>> 0;
  const pushNum = (n: number): void => {
    const scaled = Math.round(Number(n) * 1000) | 0;
    h ^= scaled & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (scaled >> 8) & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (scaled >> 16) & 0xff;
    h = Math.imul(h, 16777619);
  };

  pushNum(state.tick);
  for (const s of state.ships) {
    pushNum(s.slot);
    pushNum(s.x);
    pushNum(s.y);
    pushNum(s.vx);
    pushNum(s.vy);
    pushNum(s.angle);
    pushNum(s.hp);
    pushNum(s.score);
  }
  for (const b of state.bullets) {
    pushNum(b.id);
    pushNum(b.x);
    pushNum(b.y);
  }
  for (const a of state.asteroids) {
    pushNum(a.id);
    pushNum(a.x);
    pushNum(a.y);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}