import { Vector2 } from './vector.js';

// Компонент самонаведення (можна прикріпити і до Bullet, і до Asteroid без зміни дерева класів)
export function createHomingComponent({
  targetKind = 'asteroid',
  turnRate = 3.5,
  maxRange = 420,
} = {}) {
  return {
    targetKind,
    turnRate,
    maxRange,
  };
}

export function applyHomingBehavior(entity, dt, world) {
  const homing = entity.homing;
  if (!homing) return;

  let nearest = null;
  let nearestDist = homing.maxRange;

  for (const candidate of world.ofKind(homing.targetKind)) {
    if (!candidate.alive || candidate.id === entity.id) continue;
    const dist = entity.pos.distanceTo(candidate.pos);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = candidate;
    }
  }

  if (!nearest) return;

  const speed = entity.vel.length();
  if (speed === 0) return;

  const desiredDir = nearest.pos.sub(entity.pos).normalize();
  const currentDir = entity.vel.normalize();

  const currentAngle = Math.atan2(currentDir.y, currentDir.x);
  const desiredAngle = Math.atan2(desiredDir.y, desiredDir.x);

  // Найкоротший кут повороту в діапазоні [-PI, PI]
  let diff = desiredAngle - currentAngle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  const maxTurn = homing.turnRate * dt;
  const clampedTurn = Math.max(-maxTurn, Math.min(maxTurn, diff));
  const nextAngle = currentAngle + clampedTurn;

  entity.angle = nextAngle;
  entity.vel = Vector2.fromAngle(nextAngle, speed);
}