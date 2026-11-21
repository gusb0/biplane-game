import { setupCanvas } from './render/canvas.js';
import { renderWorld } from './render/draw.js';
import { World } from './sim/world.js';
import { createInput } from './input.js';
import { createLoop } from './loop.js';

const canvas = document.getElementById('game');
const { ctx } = setupCanvas(canvas);
const world = new World();

// ВАЖЛИВО (правила this):
// Якби ми передали `onFire: world.ship.fire`, при виклику з обробника подій `this` був би `undefined`
// (strict mode у ES-модулях), і звернення до `this.canFire()` впало б із TypeError.
// Фікс: стрілкова функція-обгортка захоплює `world` лексично, а виклик `world.ship.fire()`
// використовує implicit binding (`this === world.ship`).
const input = createInput(canvas, {
  onFire: () => {
    const bullet = world.ship.fire();
    if (bullet) {
      world.spawn(bullet);
    }
  },
  onToggleHoming: () => {
    world.ship.manualHoming = !world.ship.manualHoming;
  },
});

const loop = createLoop({
  step: (dt) => {
    world.step(dt, input.getState());
  },
  render: (alpha, stats) => {
    renderWorld(ctx, world, alpha, stats);
  },
});

loop.start();