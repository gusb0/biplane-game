export class NetworkSimulator {
  constructor({ delayMs = 0, jitterMs = 0, dropRate = 0 } = {}) {
    this.delayMs = Math.max(0, Number(delayMs) || 0);
    this.jitterMs = Math.max(0, Number(jitterMs) || 0);
    this.dropRate = Math.min(0.9, Math.max(0, Number(dropRate) || 0));
  }

  configure({ delayMs, jitterMs, dropRate }) {
    if (delayMs !== undefined) this.delayMs = Math.min(2000, Math.max(0, Number(delayMs) || 0));
    if (jitterMs !== undefined) this.jitterMs = Math.min(1000, Math.max(0, Number(jitterMs) || 0));
    if (dropRate !== undefined) this.dropRate = Math.min(0.9, Math.max(0, Number(dropRate) || 0));
  }

  toJSON() {
    return {
      delayMs: this.delayMs,
      jitterMs: this.jitterMs,
      dropRate: this.dropRate,
    };
  }

  schedule(fn) {
    if (this.dropRate > 0 && Math.random() < this.dropRate) {
      return;
    }
    if (this.delayMs <= 0 && this.jitterMs <= 0) {
      fn();
      return;
    }
    const jitterOffset = this.jitterMs > 0 ? (Math.random() * 2 - 1) * this.jitterMs : 0;
    const totalDelay = Math.max(0, Math.round(this.delayMs + jitterOffset));
    setTimeout(fn, totalDelay);
  }
}