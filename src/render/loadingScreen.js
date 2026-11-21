import { ARENA_WIDTH, ARENA_HEIGHT } from '../sim/arena.js';

export function renderLoadingScreen(ctx, { ratio = 0, label = '', error = null }) {
  ctx.save();
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

  const cx = ARENA_WIDTH / 2;
  const cy = ARENA_HEIGHT / 2;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.fillText('BIPLANE GAME — ЗАВАНТАЖЕННЯ АССЕТІВ', cx, cy - 75);

  const barW = 460;
  const barH = 26;
  const barX = cx - barW / 2;
  const barY = cy - 20;

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.strokeStyle = error ? '#ef4444' : '#38bdf8';
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY, barW, barH);

  const clamped = Math.max(0, Math.min(1, ratio));
  ctx.fillStyle = error ? '#ef4444' : '#0284c7';
  ctx.fillRect(barX + 3, barY + 3, (barW - 6) * clamped, barH - 6);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 13px monospace';
  ctx.fillText(`${Math.round(clamped * 100)}%`, cx, barY + 18);

  if (!error) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px monospace';
    ctx.fillText(label ? `Loading: ${label}` : 'Initializing...', cx, barY + 52);
  } else {
    ctx.fillStyle = '#fca5a5';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(`Помилка завантаження: ${error.message}`, cx, barY + 54);

    const btnW = 200;
    const btnH = 40;
    const btnX = cx - btnW / 2;
    const btnY = barY + 76;

    ctx.fillStyle = '#0284c7';
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.strokeStyle = '#7dd3fc';
    ctx.strokeRect(btnX, btnY, btnW, btnH);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText('Повторити (Retry)', cx, btnY + 25);
  }

  ctx.restore();
}