import { Entity } from './entity.js';
import { applyHomingBehavior } from './components.js';

export class Asteroid extends Entity {
  constructor({
    x,
    y,
    vx,
    vy,
    radius = 26,
    hp = 50,
    homing = null,
  }) {
    super({
      x,
      y,
      vx,
      vy,
      angle: Math.random() * Math.PI * 2,
      radius,
      kind: 'asteroid',
    });
    this.hp = hp;
    this.maxHp = hp;
    this.spin = (Math.random() - 0.5) * 2.2;
    // Композиція: той самий компонент homing робить міну-астероїд самонавідною
    this.homing = homing;

    // Генеруємо нерівний контур для візуалізації
    const vertices = 10;
    this.shape = Array.from({ length: vertices }, (_, i) => {
      const a = (i / vertices) * Math.PI * 2;
      const rFactor = 0.8 + Math.random() * 0.35;
      return { angle: a, factor: rFactor };
    });
  }

  get isHoming() {
    return Boolean(this.homing);
  }

  update(dt, world) {
    if (this.homing) {
      applyHomingBehavior(this, dt, world);
    } else {
      this.angle += this.spin * dt;
    }

    super.update(dt);
  }
}