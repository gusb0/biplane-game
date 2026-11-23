import { ARENA_WIDTH, ARENA_HEIGHT } from '../sim/arena.js';

export class HudController {
  #popups = [];
  #roster = [];
  #wsState = 'connected';

  setRoster(players) {
    this.#roster = Array.isArray(players) ? players : [];
  }

  setWsState(state) {
    this.#wsState = state;
  }

  attachToWorld(world, { signal } = {}) {
    this.#popups = [];
    world.addEventListener(
      'scoreChanged',
      (e) => {
        const { delta, pos } = e.detail;
        if (pos) {
          this.#popups.push({ x: pos.x, y: pos.y, text: `+${delta}`, life: 1.0 });
        }
      },
      { signal }
    );
  }

  render(ctx, world, stats) {
    const { ship } = world;
    ctx.save();

    for (let i = this.#popups.length - 1; i >= 0; i--) {
      const p = this.#popups[i];
      p.y -= 0.6;
      p.life -= 0.018;
      if (p.life <= 0) {
        this.#popups.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`PILOT: ${world.playerName} | ROOM: ${world.arenaConfig.name} [WS: ${this.#wsState}]`, 18, 22);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(`SCORE: ${world.score}`, 18, 44);

    const barW = 160;
    const barH = 12;
    ctx.fillStyle = '#334155';
    ctx.fillRect(18, 52, barW, barH);
    ctx.fillStyle = ship.hp > 35 ? '#22c55e' : '#ef4444';
    ctx.fillRect(18, 52, (ship.hp / ship.maxHp) * barW, barH);
    ctx.strokeStyle = '#64748b';
    ctx.strokeRect(18, 52, barW, barH);

    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`HP: ${ship.hp}/${ship.maxHp}`, 186, 62);

    const names = this.#roster.map((p) => p.name).join(', ') || world.playerName;
    ctx.fillStyle = '#a7f3d0';
    ctx.fillText(`Пілоти в кімнаті (${this.#roster.length || 1}): ${names}`, 18, 82);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px monospace';
    ctx.fillText(
      `Entities: ${world.size} | ${stats.stepsPerSec} steps/s | ${stats.fps} fps | ${stats.frameMs} ms`,
      ARENA_WIDTH - 18,
      24
    );

    if (!ship.alive) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.fillText(
        `БІПЛАН ЗБИТО! Респаун через ${Math.max(0, world.respawnTimer).toFixed(1)} с...`,
        ARENA_WIDTH / 2,
        ARENA_HEIGHT / 2
      );
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(
      'W/S — газ/гальмо | A/D — поворот | Space/Клік — вогонь | H — ракети | L — вийти в лобі',
      ARENA_WIDTH / 2,
      ARENA_HEIGHT - 14
    );

    ctx.restore();
  }
}