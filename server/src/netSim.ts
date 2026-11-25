export interface NetSimConfig {
  readonly delayMs: number;
  readonly jitterMs: number;
  readonly dropRate: number;
}

export class NetworkSimulator {
  delayMs: number;
  jitterMs: number;
  dropRate: number;

  constructor({ delayMs = 0, jitterMs = 0, dropRate = 0 }: Partial<NetSimConfig> = {}) {
    this.delayMs = Math.max(0, Number(delayMs) || 0);
    this.jitterMs = Math.max(0, Number(jitterMs) || 0);
    this.dropRate = Math.min(0.9, Math.max(0, Number(dropRate) || 0));
  }

  configure(patch: Partial<NetSimConfig>): void {
    if (patch.delayMs !== undefined) {
      this.delayMs = Math.min(2000, Math.max(0, Number(patch.delayMs) || 0));
    }
    if (patch.jitterMs !== undefined) {
      this.jitterMs = Math.min(1000, Math.max(0, Number(patch.jitterMs) || 0));
    }
    if (patch.dropRate !== undefined) {
      this.dropRate = Math.min(0.9, Math.max(0, Number(patch.dropRate) || 0));
    }
  }

  toJSON(): NetSimConfig {
    return {
      delayMs: this.delayMs,
      jitterMs: this.jitterMs,
      dropRate: this.dropRate,
    };
  }

  schedule(fn: () => void): void {
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