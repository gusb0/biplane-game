export function createLoop({ step, render, fixedDt = 1 / 60 }) {
  let rafId = null;
  let lastTime = 0;
  let accumulator = 0;

  let statsTimer = 0;
  let frameCount = 0;
  let stepCount = 0;
  let lastFrameMs = 0;

  const stats = {
    fps: 60,
    stepsPerSec: 60,
    frameMs: 16.7,
  };

  function tick(now) {
    if (lastTime === 0) lastTime = now;
    const rawDt = (now - lastTime) / 1000;
    lastTime = now;

    // Захист від «спіралі смерті» при перемиканні вкладок
    const frameDt = Math.min(rawDt, 0.25);
    lastFrameMs = rawDt * 1000;
    accumulator += frameDt;

    while (accumulator >= fixedDt) {
      step(fixedDt);
      accumulator -= fixedDt;
      stepCount++;
    }

    const alpha = accumulator / fixedDt;
    render(alpha, stats);

    frameCount++;
    statsTimer += rawDt;
    if (statsTimer >= 0.5) {
      stats.fps = Math.round(frameCount / statsTimer);
      stats.stepsPerSec = Math.round(stepCount / statsTimer);
      stats.frameMs = Number(lastFrameMs.toFixed(1));
      frameCount = 0;
      stepCount = 0;
      statsTimer = 0;
    }

    rafId = requestAnimationFrame(tick);
  }

  return {
    start() {
      if (rafId === null) {
        lastTime = 0;
        rafId = requestAnimationFrame(tick);
      }
    },
    stop() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  };
}