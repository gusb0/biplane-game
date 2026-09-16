import { createLoop } from './loop.js';
import { createInput } from './input.js';
import { createBiplane, integrate } from './sim/ship.js';
import { setupCanvas } from './render/canvas.js';
import { drawScene } from './render/draw.js';

const canvas = document.getElementById('gameCanvas');
const { ctx } = setupCanvas(canvas);

const input = createInput();

let currentPlane = createBiplane();
let previousPlane = JSON.parse(JSON.stringify(currentPlane));

const STEP = 1 / 60;

const loop = createLoop({
  step: STEP,
  simulate(dt) {
    previousPlane = { ...currentPlane };
    integrate(currentPlane, input, dt);
  },
  render(alpha, stats) {
    drawScene(ctx, previousPlane, currentPlane, alpha, stats);
  }
});

loop.start();