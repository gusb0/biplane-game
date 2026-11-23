import { FIXED_DT, integrateShip, createShipState, DEFAULT_ARENA } from '@biplane/shared';

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function wrapDelta(a, b, size) {
  let d = b - a;
  if (Math.abs(d) > size * 0.5) {
    return b;
  }
  return d;
}

export class ClientNetworkWorld {
  constructor({ arena = DEFAULT_ARENA, playerName = 'Pilot' } = {}) {
    this.arena = { ...DEFAULT_ARENA, ...arena };
    this.playerName = playerName;
    this.yourSlot = 0;

    // Live toggles for Netgraph / experiments
    this.predictionEnabled = true;
    this.breakDeterminism = false;
    this.interpolationDelayMs = 100;

    this.localTick = 0;
    this.nextSeq = 1;
    this.pendingInputs = [];

    // Local ship state
    this.predictedShip = createShipState({ slot: 0, name: playerName, arena: this.arena });
    this.visualOffsetX = 0;
    this.visualOffsetY = 0;
    this.lastCorrectionPx = 0;
    this.lastFireTime = 0;

    // Local predicted bullets (replaced when authoritative server bullets appear)
    this.localBullets = [];

    // Snapshot ring buffer for entity interpolation
    this.snapshotBuffer = [];
    this.lastSnapshotRecvTime = 0;
    this.lastServerTick = 0;
    this.rosterNames = new Map();

    // Rolling Netgraph histories
    this.rttHistory = [];
    this.correctionHistory = [];
  }

  setRoster(players) {
    this.rosterNames.clear();
    for (const p of players || []) {
      if (typeof p.slot === 'number') {
        this.rosterNames.set(p.slot, p.name);
      }
    }
  }

  get snapshotAgeMs() {
    if (!this.lastSnapshotRecvTime) return 0;
    return Math.max(0, performance.now() - this.lastSnapshotRecvTime);
  }

  /**
   * Called at fixed 30 Hz step: captures input, assigns seq, sends to server,
   * and predicts local ship & local bullet immediately.
   */
  stepLocal(inputState, connection) {
    this.localTick += 1;
    const seq = this.nextSeq++;
    const packet = {
      seq,
      tick: this.localTick,
      thrust: Boolean(inputState.thrust),
      brake: Boolean(inputState.brake),
      left: Boolean(inputState.left),
      right: Boolean(inputState.right),
      fire: Boolean(inputState.fire),
    };

    connection.sendInput(packet);

    if (this.predictionEnabled) {
      this.pendingInputs.push(packet);
      if (this.pendingInputs.length > 120) {
        this.pendingInputs.shift();
      }

      const jitterFn = this.breakDeterminism ? () => (Math.random() - 0.5) * 90 : null;
      integrateShip(this.predictedShip, packet, FIXED_DT, this.arena, jitterFn);

      // Local bullet prediction for instant visual feedback
      const now = performance.now();
      if (packet.fire && this.predictedShip.alive && now - this.lastFireTime >= 240) {
        this.lastFireTime = now;
        const muzzleDist = 24;
        this.localBullets.push({
          spawnedAt: now,
          x: (this.predictedShip.x + Math.cos(this.predictedShip.angle) * muzzleDist + this.arena.width) % this.arena.width,
          y: (this.predictedShip.y + Math.sin(this.predictedShip.angle) * muzzleDist + this.arena.height) % this.arena.height,
          vx: this.predictedShip.vx * 0.35 + Math.cos(this.predictedShip.angle) * 560,
          vy: this.predictedShip.vy * 0.35 + Math.sin(this.predictedShip.angle) * 560,
          ttl: 0.35,
        });
      }
    }

    // Advance temporary predicted bullets
    for (let i = this.localBullets.length - 1; i >= 0; i--) {
      const b = this.localBullets[i];
      b.ttl -= FIXED_DT;
      if (b.ttl <= 0) {
        this.localBullets.splice(i, 1);
        continue;
      }
      b.x = (b.x + b.vx * FIXED_DT + this.arena.width) % this.arena.width;
      b.y = (b.y + b.vy * FIXED_DT + this.arena.height) % this.arena.height;
    }

    // Smooth visual reconciliation offset over ~100ms
    this.visualOffsetX *= 0.65;
    this.visualOffsetY *= 0.65;
    if (Math.abs(this.visualOffsetX) < 0.05) this.visualOffsetX = 0;
    if (Math.abs(this.visualOffsetY) < 0.05) this.visualOffsetY = 0;
  }

  /**
   * Authoritative snapshot received from server:
   * 1) Reconcile local ship (snap to server + replay unacknowledged inputs)
   * 2) Push snapshot into interpolation ring buffer for remote entities
   */
  onSnapshot(snapshot, rttMs = 0) {
    const now = performance.now();
    this.lastSnapshotRecvTime = now;
    this.lastServerTick = snapshot.tick;
    this.yourSlot = snapshot.yourSlot;

    const serverSelf = snapshot.ships.find((s) => s.slot === snapshot.yourSlot);
    if (serverSelf) {
      const prevVisualX = this.predictedShip.x + this.visualOffsetX;
      const prevVisualY = this.predictedShip.y + this.visualOffsetY;

      // Discard acknowledged inputs
      this.pendingInputs = this.pendingInputs.filter((inp) => inp.seq > snapshot.lastProcessedSeq);

      // Start from authoritative server state
      this.predictedShip = {
        ...this.predictedShip,
        ...serverSelf,
        name: this.rosterNames.get(serverSelf.slot) || this.playerName,
      };

      if (this.predictionEnabled) {
        // Re-apply unacknowledged buffered inputs in order
        for (const pending of this.pendingInputs) {
          integrateShip(this.predictedShip, pending, FIXED_DT, this.arena, null);
        }

        const errX = prevVisualX - this.predictedShip.x;
        const errY = prevVisualY - this.predictedShip.y;
        const dist = Math.hypot(errX, errY);
        this.lastCorrectionPx = dist;

        // Avoid smoothing across screen wrap boundaries
        if (dist > 0.01 && dist < 180) {
          this.visualOffsetX = errX;
          this.visualOffsetY = errY;
        } else {
          this.visualOffsetX = 0;
          this.visualOffsetY = 0;
        }
      } else {
        this.pendingInputs = [];
        this.lastCorrectionPx = 0;
        this.visualOffsetX = 0;
        this.visualOffsetY = 0;
      }

      // Remove predicted local bullets once server has an authoritative bullet from us
      if (snapshot.bullets.some((b) => b.ownerSlot === this.yourSlot)) {
        this.localBullets = [];
      }
    }

    this.rttHistory.push(rttMs);
    if (this.rttHistory.length > 60) this.rttHistory.shift();

    this.correctionHistory.push(this.lastCorrectionPx);
    if (this.correctionHistory.length > 60) this.correctionHistory.shift();

    this.snapshotBuffer.push({
      recvTime: now,
      serverTimeMs: snapshot.serverTimeMs,
      tick: snapshot.tick,
      ships: snapshot.ships,
      bullets: snapshot.bullets,
      asteroids: snapshot.asteroids,
    });

    if (this.snapshotBuffer.length > 30) {
      this.snapshotBuffer.shift();
    }
  }

  /**
   * Returns complete interpolated + predicted render view for current frame.
   */
  getRenderState() {
    const renderShips = [];
    const localVisualShip = {
      ...this.predictedShip,
      x: (this.predictedShip.x + this.visualOffsetX + this.arena.width) % this.arena.width,
      y: (this.predictedShip.y + this.visualOffsetY + this.arena.height) % this.arena.height,
      isLocal: true,
    };
    renderShips.push(localVisualShip);

    if (this.snapshotBuffer.length === 0) {
      return {
        ships: renderShips,
        bullets: this.localBullets,
        asteroids: [],
      };
    }

    const targetTime = performance.now() - this.interpolationDelayMs;
    const buf = this.snapshotBuffer;

    let snapA = buf[0];
    let snapB = buf[buf.length - 1];
    let alpha = 1;

    if (buf.length >= 2) {
      for (let i = buf.length - 2; i >= 0; i--) {
        if (buf[i].recvTime <= targetTime) {
          snapA = buf[i];
          snapB = buf[i + 1];
          const span = snapB.recvTime - snapA.recvTime;
          alpha = span > 0 ? Math.min(1, Math.max(0, (targetTime - snapA.recvTime) / span)) : 1;
          break;
        }
      }
      if (targetTime < buf[0].recvTime) {
        snapA = buf[0];
        snapB = buf[0];
        alpha = 0;
      }
    }

    // Interpolate remote ships between snapA and snapB
    for (const shipB of snapB.ships) {
      if (shipB.slot === this.yourSlot) continue;
      const shipA = snapA.ships.find((s) => s.slot === shipB.slot) || shipB;
      const dx = wrapDelta(shipA.x, shipB.x, this.arena.width);
      const dy = wrapDelta(shipA.y, shipB.y, this.arena.height);
      const x = Math.abs(shipB.x - shipA.x) > this.arena.width * 0.5 ? shipB.x : lerp(shipA.x, shipA.x + dx, alpha);
      const y = Math.abs(shipB.y - shipA.y) > this.arena.height * 0.5 ? shipB.y : lerp(shipA.y, shipA.y + dy, alpha);

      renderShips.push({
        ...shipB,
        name: this.rosterNames.get(shipB.slot) || `Pilot-${shipB.slot + 1}`,
        x,
        y,
        angle: lerpAngle(shipA.angle, shipB.angle, alpha),
        isLocal: false,
      });
    }

    // Interpolate bullets + include predicted local bullets
    const renderBullets = [...this.localBullets];
    for (const bB of snapB.bullets) {
      const bA = snapA.bullets.find((b) => b.id === bB.id) || bB;
      const x = Math.abs(bB.x - bA.x) > this.arena.width * 0.5 ? bB.x : lerp(bA.x, bB.x, alpha);
      const y = Math.abs(bB.y - bA.y) > this.arena.height * 0.5 ? bB.y : lerp(bA.y, bB.y, alpha);
      renderBullets.push({ ...bB, x, y });
    }

    // Interpolate asteroids
    const renderAsteroids = snapB.asteroids.map((aB) => {
      const aA = snapA.asteroids.find((a) => a.id === aB.id) || aB;
      const x = Math.abs(aB.x - aA.x) > this.arena.width * 0.5 ? aB.x : lerp(aA.x, aB.x, alpha);
      const y = Math.abs(aB.y - aA.y) > this.arena.height * 0.5 ? aB.y : lerp(aA.y, aB.y, alpha);
      return { ...aB, x, y };
    });

    return {
      ships: renderShips,
      bullets: renderBullets,
      asteroids: renderAsteroids,
    };
  }
}