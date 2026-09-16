export function createLoop({ step = 1 / 60, simulate, render }) {
  let running = false;
  let requestId = null;
  let accumulator = 0;
  let lastTime = performance.now();

  let stepCount = 0;
  let frameCount = 0;
  let lastStatReset = performance.now();

  const stats = { stepsPerSec: 0, framesPerSec: 0, frameTimeMs: 0 };

  function frame(now) {
    if (!running) return;

    const rawDt = (now - lastTime) / 1000;
    lastTime = now;
    stats.frameTimeMs = rawDt * 1000;

    accumulator += Math.min(rawDt, 0.25);

    while (accumulator >= step) {
      simulate(step);
      accumulator -= step;
      stepCount++;
    }

    render(accumulator / step, stats);
    frameCount++;

    if (now - lastStatReset >= 1000) {
      stats.stepsPerSec = stepCount;
      stats.framesPerSec = frameCount;
      stepCount = 0;
      frameCount = 0;
      lastStatReset = now;
    }

    requestId = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastTime = performance.now();
      lastStatReset = performance.now();
      requestId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (requestId) cancelAnimationFrame(requestId);
    }
  };
}