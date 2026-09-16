import { ARENA, wrapArena } from './arena.js';

export function createBiplane() {
  return {
    x: ARENA.width / 2,
    y: ARENA.height / 2,
    vx: 0,
    vy: 0,
    angle: 0,
    thrust: false,
    propellerAngle: 0
  };
}

export function integrate(plane, input, dt) {
  const ROTATION_SPEED = 3.2;
  const THRUST_ACCEL = 350;
  const DRAG = 0.985;

  if (input.isDown('KeyA') || input.isDown('ArrowLeft')) {
    plane.angle -= ROTATION_SPEED * dt;
  }
  if (input.isDown('KeyD') || input.isDown('ArrowRight')) {
    plane.angle += ROTATION_SPEED * dt;
  }

  plane.thrust = input.isDown('KeyW') || input.isDown('ArrowUp');
  if (plane.thrust) {
    plane.vx += Math.cos(plane.angle) * THRUST_ACCEL * dt;
    plane.vy += Math.sin(plane.angle) * THRUST_ACCEL * dt;
  }

  plane.vx *= DRAG;
  plane.vy *= DRAG;

  plane.x += plane.vx * dt;
  plane.y += plane.vy * dt;

  plane.propellerAngle += (plane.thrust ? 25 : 8) * dt;

  wrapArena(plane);
}