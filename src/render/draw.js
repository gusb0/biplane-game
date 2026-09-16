function lerpAngle(a, b, t) {
  const CS = (1 - t) * Math.cos(a) + t * Math.cos(b);
  const SN = (1 - t) * Math.sin(a) + t * Math.sin(b);
  return Math.atan2(SN, CS);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function drawScene(ctx, prevPlane, currPlane, alpha, stats) {
  const w = ctx.canvas.clientWidth;
  const h = ctx.canvas.clientHeight;

  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#1a2332';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#253347';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 60) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  let renderX = lerp(prevPlane.x, currPlane.x, alpha);
  let renderY = lerp(prevPlane.y, currPlane.y, alpha);
  if (Math.abs(currPlane.x - prevPlane.x) > 200) renderX = currPlane.x;
  if (Math.abs(currPlane.y - prevPlane.y) > 200) renderY = currPlane.y;

  const renderAngle = lerpAngle(prevPlane.angle, currPlane.angle, alpha);

  ctx.save();
  ctx.translate(renderX, renderY);
  ctx.rotate(renderAngle);

  // Фюзеляж
  ctx.fillStyle = '#d94125';
  ctx.fillRect(-15, -4, 30, 8);

  // Крила
  ctx.fillStyle = '#f2a93b';
  ctx.fillRect(-5, -18, 10, 36);

  // Хвіст
  ctx.fillStyle = '#d94125';
  ctx.beginPath();
  ctx.moveTo(-15, 0);
  ctx.lineTo(-22, -10);
  ctx.lineTo(-22, 10);
  ctx.closePath();
  ctx.fill();

  // Пропелер
  ctx.save();
  ctx.translate(15, 0);
  ctx.rotate(currPlane.propellerAngle);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-1, -10, 2, 20);
  ctx.restore();

  ctx.restore();

  drawHud(ctx, stats);
}

function drawHud(ctx, stats) {
  ctx.fillStyle = '#00ffcc';
  ctx.font = '14px monospace';
  ctx.fillText(`steps/s:  ${stats.stepsPerSec}`, 15, 25);
  ctx.fillText(`frames/s: ${stats.framesPerSec}`, 15, 45);
  ctx.fillText(`frame ms: ${stats.frameTimeMs.toFixed(2)}`, 15, 65);
}