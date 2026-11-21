import { Entity } from './entity.js';
import { applyHomingBehavior } from './components.js';

export class Bullet extends Entity {
  constructor({
    x,
    y,
    vx,
    vy,
    angle,
    ownerId,
    ttl = 1.5,
    damage = 25,
    homing = null,
  }) {
    super({
      x,
      y,
      vx,
      vy,
      angle,
      radius: homing ? 5 : 4,
      kind: 'bullet',
    });
    this.ownerId = ownerId;
    this.ttl = ttl;
    this.damage = damage;
    // Композиція: куля може мати компонент самонаведення без підкласу HomingBullet
    this.homing = homing;
  }

  update(dt, world) {
    if (this.homing) {
      applyHomingBehavior(this, dt, world);
    }

    super.update(dt);

    this.ttl -= dt;
    if (this.ttl <= 0) {
      world.despawn(this.id);
    }
  }
}