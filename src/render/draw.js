import { ARENA_WIDTH, ARENA_HEIGHT } from '../sim/arena.js';

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function getInterpolatedPos(entity, alpha) {
  // Якщо відбулося загортання через край арени — не інтерполюємо через весь екран
  if (Math.abs(entity.pos.x - entity.prevPos.x) > ARENA_WIDTH / 2 ||
      Math.abs(entity.pos.y - entity.prevPos.y) > ARENA_HEIGHT / 2) {
    return entity.pos;
  }
  return {
    x: lerp(entity.prevPos.x, entity.pos.x, alpha),
    y: lerp(entity.prevPos.y, entity.pos.y, alpha),
  };
}

function drawBackground(ctx) {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
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

function drawShip(ctx, ship, alpha) {
  const pos = getInterpolatedPos(ship, alpha);
  const angle = lerp(ship.prevAngle, ship.angle, alpha);

  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(angle);

  // Щит навколо біплана
  if (ship.hasShield) {
    ctx.beginPath();
    ctx.arc(0, 0, ship.radius + 8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Фюзеляж біплана
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(20, 0);
  ctx.lineTo(-16, -6);
  ctx.lineTo(-18, 0);
  ctx.lineTo(-16, 6);
  ctx.closePath();
  ctx.fill();

  // Верхнє та нижнє крила біплана
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(-3, -18, 8, 36);
  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(-7, -15, 4, 30);

  // Хвостове оперення
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(-18, -7, 4, 14);

  // Пропелер спереду
  const propSpan = 8 * Math.sin(ship.propellerPhase);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(21, -propSpan);
  ctx.lineTo(21, propSpan);
  ctx.stroke();

  ctx.restore();
}

function drawBullet(ctx, bullet, alpha) {
  const pos = getInterpolatedPos(bullet, alpha);
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(bullet.angle);

  ctx.fillStyle = bullet.homing ? '#38bdf8' : '#facc15';
  ctx.beginPath();
  ctx.ellipse(0, 0, bullet.homing ? 7 : 5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawAsteroid(ctx, asteroid, alpha) {
  const pos = getInterpolatedPos(asteroid, alpha);
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(asteroid.angle);

  ctx.beginPath();
  asteroid.shape.forEach((pt, idx) => {
    const r = asteroid.radius * pt.factor;
    const x = Math.cos(pt.angle) * r;
    const y = Math.sin(pt.angle) * r;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();

  if (asteroid.isHoming) {
    // Самонавідна червона міна-астероїд (композиція)
    ctx.fillStyle = 'rgba(244, 63, 94, 0.25)';
    ctx.strokeStyle = '#fb7185';
  } else {
    ctx.fillStyle = 'rgba(100, 116, 139, 0.35)';
    ctx.strokeStyle = '#94a3b8';
  }
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  if (asteroid.isHoming) {
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawPickup(ctx, pickup) {
  const scale = 1 + Math.sin(pickup.pulse) * 0.1;
  const colorMap = {
    shield: { bg: '#0284c7', label: 'S' },
    rapidFire: { bg: '#d97706', label: 'R' },
    homing: { bg: '#7c3aed', label: 'H' },
  };
  const style = colorMap[pickup.effect.type] || colorMap.shield;

  ctx.save();
  ctx.translate(pickup.pos.x, pickup.pos.y);
  ctx.scale(scale, scale);

  ctx.fillStyle = style.bg;
  ctx.beginPath();
  ctx.arc(0, 0, pickup.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px system-ui, sans-serif';
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

function drawHud(ctx, world, stats) {
  const { ship } = world;

  ctx.save();
  // Лівий верхній кут: HP, рахунок, бафи
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE: ${world.score}`, 18, 28);

  // Смужка здоров'я (#hp через публічний геттер ship.hp)
  const barW = 160;
  const barH = 12;
  ctx.fillStyle = '#334155';
  ctx.fillRect(18, 38, barW, barH);
  ctx.fillStyle = ship.hp > 35 ? '#22c55e' : '#ef4444';
  ctx.fillRect(18, 38, (ship.hp / ship.maxHp) * barW, barH);
  ctx.strokeStyle = '#64748b';
  ctx.strokeRect(18, 38, barW, barH);

  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(`HP: ${ship.hp}/${ship.maxHp}`, 186, 48);

  // Активні ефекти композиції
  const buffs = [];
  if (ship.hasShield) buffs.push(`Shield (${ship.shieldTimer.toFixed(1)}s)`);
  if (ship.hasRapidFire) buffs.push(`RapidFire (${ship.rapidFireTimer.toFixed(1)}s)`);
  if (ship.hasHoming) {
    buffs.push(
      ship.manualHoming
        ? 'Homing [H: ON]'
        : `Homing (${ship.homingTimer.toFixed(1)}s)`
    );
  }
  if (buffs.length > 0) {
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`Active: ${buffs.join(' | ')}`, 18, 70);
  }

  // Правий верхній кут: метрики циклу та Map.size
  ctx.textAlign = 'right';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px monospace';
  ctx.fillText(
    `Entities: ${world.size} | ${stats.stepsPerSec} steps/s | ${stats.fps} fps | ${stats.frameMs} ms`,
    ARENA_WIDTH - 18,
    26
  );

  // Повідомлення під час 2-секундного респауну
  if (!ship.alive) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(
      `БІПЛАН ЗБИТО! Респаун через ${Math.max(0, world.respawnTimer).toFixed(1)} с...`,
      ARENA_WIDTH / 2,
      ARENA_HEIGHT / 2
    );
  }

  // Підказка керування знизу
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748b';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(
    'W/S — газ/гальмо | A/D — поворот | Space/Клік — вогонь | H — режим самонаведення | Бонуси: [S] Щит [R] Швидкостріл [H] Ракети',
    ARENA_WIDTH / 2,
    ARENA_HEIGHT - 14
  );

  ctx.restore();
}

export function renderWorld(ctx, world, alpha, stats) {
  drawBackground(ctx);

  for (const entity of world) {
    switch (entity.kind) {
      case 'pickup':
        drawPickup(ctx, entity);
        break;
      case 'asteroid':
        drawAsteroid(ctx, entity, alpha);
        break;
      case 'bullet':
        drawBullet(ctx, entity, alpha);
        break;
      case 'ship':
        drawShip(ctx, entity, alpha);
        break;
      case 'explosion':
        drawExplosion(ctx, entity);
        break;
    }
  }

  drawHud(ctx, world, stats);
}