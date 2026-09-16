export const ARENA = { width: 1200, height: 800 };

export function wrapArena(entity) {
  if (entity.x < 0) entity.x += ARENA.width;
  if (entity.x > ARENA.width) entity.x -= ARENA.width;
  if (entity.y < 0) entity.y += ARENA.height;
  if (entity.y > ARENA.height) entity.y -= ARENA.height;
}