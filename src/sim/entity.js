import { Vector2 } from './vector.js';
import { wrapPosition } from './arena.js';

export class Entity {
  static #nextId = 1;
  #id = Entity.#nextId++;

  constructor({
    x = 0,
    y = 0,
    vx = 0,
    vy = 0,
    angle = 0,
    radius = 12,
    kind = 'entity',
  } = {}) {
    this.pos = new Vector2(x, y);
    this.prevPos = this.pos.clone();
    this.vel = new Vector2(vx, vy);
    this.angle = angle;
    this.prevAngle = angle;
    this.radius = radius;
    this.kind = kind;
    this.alive = true;
  }

  get id() {
    return this.#id;
  }

  savePreviousState() {
    this.prevPos = this.pos.clone();
    this.prevAngle = this.angle;
  }

  update(dt) {
    this.pos = wrapPosition(this.pos.add(this.vel.scale(dt)));
  }
}