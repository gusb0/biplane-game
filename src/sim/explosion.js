import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export class Explosion extends Entity {
  constructor({ x, y, count = 18, colors = ['#f97316', '#facc15', '#ef4444'] }) {
    super({
      x,
      y,
      vx: 0,
      vy: 0,
      radius: 0,
      kind: 'explosion',
    });

    this.particles = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 190;
      const maxLife = 0.3 + Math.random() * 0.45;
      return {
        pos: new Vector2(x, y),
        vel: Vector2.fromAngle(angle, speed),
        life: maxLife,
        maxLife,
        size: 2 + Math.random() * 3.5,
        color: colors[Math.floor(Math.random() * colors.length)],
      };
    });
  }

  update(dt, world) {
    let aliveParticles = 0;
    for (const p of this.particles) {
      if (p.life > 0) {
        p.pos = p.pos.add(p.vel.scale(dt));
        p.vel = p.vel.scale(0.95);
        p.life -= dt;
        if (p.life > 0) aliveParticles++;
      }
    }

    if (aliveParticles === 0) {
      world.despawn(this.id);
    }
  }
}