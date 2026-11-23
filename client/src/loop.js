export function createLoop({ step, render, fixedHz = 30 }) {
  const fixedDt = 1 / fixedHz;
  let rafId = null;
  let running = false;
  let lastTime = 0;
  let accumulator = 0;

  let fpsFrames = 0;
  let fpsTimer = 0;
  const stats = { fps: 60, frameMs: 16.7 };

  function frame(now) {
    if (!running) return;
    const rawDt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    accumulator += rawDt;

    fpsFrames += 1;
    fpsTimer += rawDt;
    if (fpsTimer >= 0.5) {
      stats.fps = Math.round(fpsFrames / fpsTimer);
      stats.frameMs = Number(((fpsTimer / fpsFrames) * 1000).toFixed(1));
      fpsFrames = 0;
      fpsTimer = 0;
    }

    while (accumulator >= fixedDt) {
      step(fixedDt);
      accumulator -= fixedDt;
    }

    render(accumulator / fixedDt, stats);
    rafId = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastTime = performance.now();
      accumulator = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
    },
  };
}