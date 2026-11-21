import { setupCanvas } from './render/canvas.js';
import { renderWorld } from './render/draw.js';
import { renderLoadingScreen } from './render/loadingScreen.js';
import { loadAll, loadAllSequential, fetchJson, withRetry } from './assets/loader.js';
import { SoundEngine } from './audio/audio.js';
import { HudController } from './ui/hud.js';
import { World } from './sim/world.js';
import { createInput } from './input.js';
import { createLoop } from './loop.js';
import { Lobby } from './lobby/lobby.js';
import { mountLobbyDom } from './lobby/lobbyDom.js';

const canvas = document.getElementById('game');
const lobbyOverlay = document.getElementById('lobby-overlay');
const { ctx, resize } = setupCanvas(canvas);
const soundEngine = new SoundEngine();

window.__lab03 = {
  loadAll,
  loadAllSequential,
  fetchJson,
  withRetry,
  async benchmarkLoad() {
    const t0 = performance.now();
    await loadAllSequential('/assets/manifest.json', { audioCtx: soundEngine.context });
    const seqMs = Math.round(performance.now() - t0);

    const t1 = performance.now();
    await loadAll('/assets/manifest.json', { audioCtx: soundEngine.context });
    const concMs = Math.round(performance.now() - t1);

    console.table({
      'Sequential await (ms)': seqMs,
      'Concurrent Promise.all (ms)': concMs,
    });
    return { seqMs, concMs };
  },
};

let activeLoop = null;
let activeInput = null;
let activeSessionController = null;

async function bootAssets() {
  const urlParams = new URLSearchParams(window.location.search);
  const manifestUrl = urlParams.get('manifest') || '/assets/manifest.json';

  while (true) {
    const loadController = new AbortController();
    let lastProgress = { ratio: 0, label: 'manifest.json' };
    renderLoadingScreen(ctx, lastProgress);

    try {
      const assets = await loadAll(manifestUrl, {
        audioCtx: soundEngine.context,
        signal: loadController.signal,
        onProgress: (progress) => {
          lastProgress = progress;
          renderLoadingScreen(ctx, progress);
        },
      });
      return assets;
    } catch (err) {
      renderLoadingScreen(ctx, {
        ratio: lastProgress.ratio,
        label: lastProgress.label,
        error: err,
      });

      await new Promise((resolve) => {
        canvas.addEventListener('pointerdown', () => resolve(), { once: true });
      });
    }
  }
}

function startGameSession(assets, { room, playerName }) {
  if (activeLoop) activeLoop.stop();
  if (activeInput) activeInput.destroy();
  if (activeSessionController) activeSessionController.abort();

  activeSessionController = new AbortController();
  const { signal } = activeSessionController;

  const world = new World({
    arenaConfig: room.arena,
    playerName,
  });
  resize();

  const hud = new HudController();
  soundEngine.attachToWorld(world, { signal });
  hud.attachToWorld(world, { signal });

  activeInput = createInput(canvas, {
    onFire: () => {
      soundEngine.unlock();
      world.fireShipBullet();
    },
    onToggleHoming: () => {
      world.ship.manualHoming = !world.ship.manualHoming;
    },
    onOpenLobby: () => {
      if (activeLoop) activeLoop.stop();
      lobbyUi.show();
      lobby.startPolling();
    },
  });

  activeLoop = createLoop({
    step: (dt) => {
      world.step(dt, activeInput.getState());
    },
    render: (alpha, stats) => {
      renderWorld(ctx, world, alpha, stats, {
        sprites: assets.sprites,
        hud,
      });
    },
  });

  activeLoop.start();
}

const lobby = new Lobby({ endpoint: '/api/rooms', pollIntervalMs: 4000 });
const lobbyUi = mountLobbyDom(lobbyOverlay, lobby, {
  onJoinRequest: () => {
    soundEngine.unlock();
  },
});

(async () => {
  const assets = await bootAssets();
  soundEngine.setBuffers(assets.sounds);

  lobby.addEventListener('joined', (e) => {
    startGameSession(assets, e.detail);
  });

  lobbyUi.show();
  lobby.startPolling();
})();