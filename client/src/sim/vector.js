export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  // Чисті методи (не мутують поточний вектор або аргумент)
  add(v) {
    return new Vector2(this.x + v.x, this.y + v.y);
  }

  sub(v) {
    return new Vector2(this.x - v.x, this.y - v.y);
  }

  scale(scalar) {
    return new Vector2(this.x * scalar, this.y * scalar);
  }

  length() {
    return Math.hypot(this.x, this.y);
  }

  lengthSq() {
    return this.x * this.x + this.y * this.y;
  }

  normalize() {
    const len = this.length();
    if (len === 0) return new Vector2(0, 0);
    return new Vector2(this.x / len, this.y / len);
  }

  rotate(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Vector2(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos
    );
  }

  dot(v) {
    return this.x * v.x + this.y * v.y;
  }

  distanceTo(v) {
    return Math.hypot(this.x - v.x, this.y - v.y);
  }

  clone() {
    return new Vector2(this.x, this.y);
  }

  // Варіанти з мутацією на місці для гарячих ділянок циклу
  addInPlace(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  scaleInPlace(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    return this;
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  static fromAngle(angle, magnitude = 1) {
    return new Vector2(Math.cos(angle) * magnitude, Math.sin(angle) * magnitude);
  }
}