export class SoundEngine {
  #ctx = null;
  #buffers = new Map();
  #muted = false;

  get context() {
    if (!this.#ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.#ctx = new AudioCtx();
    }
    return this.#ctx;
  }

  get muted() {
    return this.#muted;
  }

  toggleMute() {
    this.#muted = !this.#muted;
    return this.#muted;
  }

  async unlock() {
    const ctx = this.context;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  setBuffers(buffersObj) {
    this.#buffers.clear();
    for (const [name, buffer] of Object.entries(buffersObj)) {
      this.#buffers.set(name, buffer);
    }
  }

  play(name, { volume = 0.7, pitchJitter = 0.06 } = {}) {
    if (this.#muted || !this.#ctx || this.#ctx.state !== 'running') return;
    const buffer = this.#buffers.get(name);
    if (!buffer) return;

    const source = this.#ctx.createBufferSource();
    source.buffer = buffer;

    if (pitchJitter > 0) {
      source.playbackRate.value = 1 + (Math.random() * 2 - 1) * pitchJitter;
    }

    const gain = this.#ctx.createGain();
    gain.gain.value = volume;

    source.connect(gain);
    gain.connect(this.#ctx.destination);
    source.start(0);
  }

  attachToWorld(world, { signal } = {}) {
    world.addEventListener(
      'fired',
      () => this.play('shoot', { volume: 0.45, pitchJitter: 0.08 }),
      { signal }
    );
    world.addEventListener(
      'hit',
      () => this.play('hit', { volume: 0.55, pitchJitter: 0.1 }),
      { signal }
    );
    world.addEventListener(
      'exploded',
      (e) => {
        const isShip = e.detail?.kind === 'ship';
        this.play('explosion', { volume: isShip ? 0.85 : 0.6, pitchJitter: 0.12 });
      },
      { signal }
    );
    world.addEventListener(
      'pickup',
      () => this.play('pickup', { volume: 0.65, pitchJitter: 0.02 }),
      { signal }
    );
  }
}