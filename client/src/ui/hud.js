import { renderNetgraph } from './netgraph.js';

export class HudController {
  #roster = [];
  #wsState = 'connected';

  setRoster(players) {
    this.#roster = Array.isArray(players) ? players : [];
  }

  setWsState(state) {
    this.#wsState = state;
  }

  render(ctx, { netWorld, connection, stats }) {
    const ship = netWorld.predictedShip;
    const { width, height, name } = netWorld.arena;

    ctx.save();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`PILOT: ${netWorld.playerName} | ROOM: ${name} [WS: ${this.#wsState}]`, 18, 22);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(`SCORE: ${ship.score}`, 18, 44);

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

    const names = this.#roster.map((p) => p.name).join(', ') || netWorld.playerName;
    ctx.fillStyle = '#a7f3d0';
    ctx.fillText(`Пілоти в бою (${this.#roster.length || 1}): ${names}`, 18, 82);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px monospace';
    ctx.fillText(
      `Server Tick: #${netWorld.lastServerTick} | ${stats.fps} fps | ${stats.frameMs} ms`,
      width - 14,
      24
    );

    if (!ship.alive) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.fillText(
        `БІПЛАН ЗБИТО! Респаун через ${Math.max(0, ship.respawnTimer).toFixed(1)} с...`,
        width / 2,
        height / 2
      );
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(
      'W/S — газ/гальмо | A/D — поворот | Space/Клік — вогонь | L — вийти в лобі',
      width / 2,
      height - 14
    );

    ctx.restore();

    renderNetgraph(ctx, { netWorld, connection, arenaWidth: width });
  }
}