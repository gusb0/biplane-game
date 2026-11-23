import { Entity } from './entity.js';

// Бонус: нерухомий, має колізію, але не є кораблем. Поведінка задається даними (effect).
export class Pickup extends Entity {
  constructor({ x, y, effectType = 'shield', duration = 7 }) {
    super({
      x,
      y,
      vx: 0,
      vy: 0,
      angle: 0,
      radius: 16,
      kind: 'pickup',
    });
    this.effect = {
      type: effectType, // 'shield' | 'rapidFire' | 'homing'
      duration,
    };
    this.ttl = 14;
    this.pulse = 0;
  }

  update(dt, world) {
    this.pulse += dt * 4;
    this.ttl -= dt;
    if (this.ttl <= 0) {
      world.despawn(this.id);
    }
  }
}