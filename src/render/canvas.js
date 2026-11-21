import { ARENA_WIDTH, ARENA_HEIGHT } from '../sim/arena.js';

export function setupCanvas(canvas) {
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const maxW = window.innerWidth - 32;
    const maxH = window.innerHeight - 32;
    const scale = Math.min(maxW / ARENA_WIDTH, maxH / ARENA_HEIGHT, 1.2);

    const displayW = Math.floor(ARENA_WIDTH * scale);
    const displayH = Math.floor(ARENA_HEIGHT * scale);

    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;
    canvas.width = Math.floor(displayW * dpr);
    canvas.height = Math.floor(displayH * dpr);

    ctx.setTransform(
      (canvas.width / ARENA_WIDTH),
      0,
      0,
      (canvas.height / ARENA_HEIGHT),
      0,
      0
    );
  }

  resize();
  window.addEventListener('resize', resize);

  return { ctx, resize };
}