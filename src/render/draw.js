import { ARENA_WIDTH, ARENA_HEIGHT } from '../sim/arena.js';

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function getInterpolatedPos(entity, alpha) {
  if (
    Math.abs(entity.pos.x - entity.prevPos.x) > ARENA_WIDTH / 2 ||
    Math.abs(entity.pos.y - entity.prevPos.y) > ARENA_HEIGHT / 2
  ) {
    return entity.pos;
  }
  return {
    x: lerp(entity.prevPos.x, entity.pos.x, alpha),
    y: lerp(entity.prevPos.y, entity.pos.y, alpha),
  };
}

function drawSpriteFrame(ctx, sprites, frameKey, size) {
  if (!sprites?.sheet || !sprites?.frames?.[frameKey]) return false;
  const f = sprites.frames[frameKey];
  ctx.drawImage(sprites.sheet, f.x, f.y, f.w, f.h, -size / 2, -size / 2, size, size);
  return true;
}

function drawBackground(ctx, arenaConfig) {
  ctx.fillStyle = arenaConfig?.bgColor || '#0f172a';
  ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

  ctx.strokeStyle = arenaConfig?.gridColor || 'rgba(148, 163, 184, 0.08)';
  ctx.lineWidth = 1;
  const grid = 48;
  for (let x = 0; x <= ARENA_WIDTH; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ARENA_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= ARENA_HEIGHT; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(ARENA_WIDTH, y);
    ctx.stroke();
  }
}

function drawShip(ctx, ship, alpha, sprites) {
  const pos = getInterpolatedPos(ship, alpha);
  const angle = lerp(ship.prevAngle, ship.angle, alpha);

  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(angle);

  if (ship.hasShield) {
    ctx.beginPath();
    ctx.arc(0, 0, ship.radius + 9, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  const drawn = drawSpriteFrame(ctx, sprites, 'biplane', 52);
  if (!drawn) {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(-16, -6, 34, 12);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-3, -18, 8, 36);
  }

  ctx.restore();
}

function drawBullet(ctx, bullet, alpha, sprites) {
  const pos = getInterpolatedPos(bullet, alpha);
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(bullet.angle);

  const frameKey = bullet.homing ? 'homingBullet' : 'bullet';
  const size = bullet.homing ? 26 : 22;
  const drawn = drawSpriteFrame(ctx, sprites, frameKey, size);
  if (!drawn) {
    ctx.fillStyle = bullet.homing ? '#38bdf8' : '#facc15';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawAsteroid(ctx, asteroid, alpha, sprites) {
  const pos = getInterpolatedPos(asteroid, alpha);
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(asteroid.angle);

  const frameKey = asteroid.isHoming ? 'homingAsteroid' : 'asteroid';
  const size = asteroid.radius * 2.5;
  const drawn = drawSpriteFrame(ctx, sprites, frameKey, size);
  if (!drawn) {
    ctx.strokeStyle = asteroid.isHoming ? '#fb7185' : '#94a3b8';
    ctx.beginPath();
    ctx.arc(0, 0, asteroid.radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPickup(ctx, pickup, sprites) {
  const scale = 1 + Math.sin(pickup.pulse) * 0.1;
  const colorMap = {
    shield: { ring: '#38bdf8', label: 'S' },
    rapidFire: { ring: '#f59e0b', label: 'R' },
    homing: { ring: '#a855f7', label: 'H' },
  };
  const style = colorMap[pickup.effect.type] || colorMap.shield;

  ctx.save();
  ctx.translate(pickup.pos.x, pickup.pos.y);
  ctx.scale(scale, scale);

  drawSpriteFrame(ctx, sprites, 'pickup', 40);

  ctx.strokeStyle = style.ring;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, pickup.radius + 3, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(style.label, 0, 1);

  ctx.restore();
}

function drawExplosion(ctx, explosion) {
  for (const p of explosion.particles) {
    if (p.life <= 0) continue;
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function renderWorld(ctx, world, alpha, stats, { sprites, hud } = {}) {
  drawBackground(ctx, world.arenaConfig);

  for (const entity of world) {
    switch (entity.kind) {
      case 'pickup':
        drawPickup(ctx, entity, sprites);
        break;
      case 'asteroid':
        drawAsteroid(ctx, entity, alpha, sprites);
        break;
      case 'bullet':
        drawBullet(ctx, entity, alpha, sprites);
        break;
      case 'ship':
        drawShip(ctx, entity, alpha, sprites);
        break;
      case 'explosion':
        drawExplosion(ctx, entity);
        break;
    }
  }

  if (hud) {
    hud.render(ctx, world, stats);
  }
}