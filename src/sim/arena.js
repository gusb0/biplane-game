import { Vector2 } from './vector.js';

export let ARENA_WIDTH = 960;
export let ARENA_HEIGHT = 640;

export function setArenaSize(width, height) {
  ARENA_WIDTH = width;
  ARENA_HEIGHT = height;
}

export function wrapPosition(pos) {
  let { x, y } = pos;
  if (x < 0) x += ARENA_WIDTH;
  if (x >= ARENA_WIDTH) x -= ARENA_WIDTH;
  if (y < 0) y += ARENA_HEIGHT;
  if (y >= ARENA_HEIGHT) y -= ARENA_HEIGHT;
  return new Vector2(x, y);
}

export function findSafeSpawnPoint(world, safeRadius = 150) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const candidate = new Vector2(
      100 + Math.random() * Math.max(120, ARENA_WIDTH - 200),
      100 + Math.random() * Math.max(120, ARENA_HEIGHT - 200)
    );

    let safe = true;
    for (const entity of world) {
      if (entity.kind === 'asteroid' && entity.pos.distanceTo(candidate) < safeRadius) {
        safe = false;
        break;
      }
    }
    if (safe) return candidate;
  }

  return new Vector2(ARENA_WIDTH / 2, ARENA_HEIGHT / 2);
}