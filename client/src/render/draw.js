export function renderNetworkScene(ctx, { netWorld, connection, stats, hud }) {
  const { width, height, bgColor, gridColor } = netWorld.arena;
  const renderState = netWorld.getRenderState();

  ctx.save();
  ctx.fillStyle = bgColor || '#0f172a';
  ctx.fillRect(0, 0, width, height);

  // Arena grid
  ctx.strokeStyle = gridColor || 'rgba(56, 189, 248, 0.08)';
  ctx.lineWidth = 1;
  const step = 48;
  for (let gx = 0; gx <= width; gx += step) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, height);
    ctx.stroke();
  }
  for (let gy = 0; gy <= height; gy += step) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(width, gy);
    ctx.stroke();
  }

  // Asteroids
  for (const ast of renderState.asteroids) {
    ctx.save();
    ctx.translate(ast.x, ast.y);
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, ast.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Bullets
  for (const b of renderState.bullets) {
    ctx.save();
    ctx.fillStyle = b.ownerSlot === netWorld.yourSlot || b.ownerSlot === undefined ? '#fde047' : '#fb7185';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Biplanes (local predicted + remote interpolated)
  for (const ship of renderState.ships) {
    if (!ship.alive) continue;

    ctx.save();
    ctx.translate(ship.x, ship.y);

    // Callsign & HP label above biplane
    ctx.fillStyle = ship.isLocal ? '#38bdf8' : '#f97316';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${ship.name} (${ship.hp} HP)`, 0, -24);

    ctx.rotate(ship.angle);

    // Fuselage
    ctx.fillStyle = ship.isLocal ? '#0284c7' : '#dc2626';
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-14, -7);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-14, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Biplane wings
    ctx.fillStyle = ship.isLocal ? '#38bdf8' : '#fb923c';
    ctx.fillRect(-3, -18, 7, 36);
    ctx.strokeRect(-3, -18, 7, 36);

    // Propeller
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(19, -7);
    ctx.lineTo(19, 7);
    ctx.stroke();

    ctx.restore();
  }

  ctx.restore();

  hud.render(ctx, { netWorld, connection, stats });
}