import { setupCanvas } from './render/canvas.js';
import { renderWorld } from './render/draw.js';
import { renderLoadingScreen } from './render/loadingScreen.js';
import { loadAll } from './assets/loader.js';
import { SoundEngine } from './audio/audio.js';
import { HudController } from './ui/hud.js';
import { World } from './sim/world.js';
import { createInput } from './input.js';
import { createLoop } from './loop.js';
import { Lobby } from './lobby/lobby.js';
import { mountLobbyDom } from './lobby/lobbyDom.js';
import { GameConnection } from './net/connection.js';

const canvas = document.getElementById('game');
const lobbyOverlay = document.getElementById('lobby-overlay');
const chatPanel = document.getElementById('chat-panel');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

const { ctx, resize } = setupCanvas(canvas);
const soundEngine = new SoundEngine();
const connection = new GameConnection();

let activeLoop = null;
let activeInput = null;
let activeSessionController = null;
let activeHud = null;

function appendChatLine(html, isSystem = false) {
  const div = document.createElement('div');
  if (isSystem) div.className = 'chat-sys';
  div.innerHTML = html;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  connection.send('chat', { text });
  chatInput.value = '';
  chatInput.blur();
});

connection.addEventListener('status', (e) => activeHud?.setWsState(e.detail.state));

connection.addEventListener('joined', (e) => {
  const { players, room } = e.detail;
  activeHud?.setRoster(players);
  appendChatLine(`Ви увійшли в кімнату «${room.name}»`, true);
});

connection.addEventListener('roster', (e) => {
  const { players, joined, left } = e.detail;
  activeHud?.setRoster(players);
  if (joined) appendChatLine(`+ ${joined.name} приєднався до кімнати`, true);
  if (left) appendChatLine(`- ${left.name} вийшов із кімнати`, true);
});

connection.addEventListener('chat', (e) => {
  const { message } = e.detail;
  const safeName = String(message.name).replace(/[<>&]/g, '');
  const safeText = String(message.text).replace(/[<>&]/g, '');
  appendChatLine(`<b>${safeName}:</b> ${safeText}`);
});

async function bootAssets() {
  while (true) {
    let lastProgress = { ratio: 0, label: 'manifest.json' };
    renderLoadingScreen(ctx, lastProgress);

    try {
      return await loadAll('/assets/manifest.json', {
        audioCtx: soundEngine.context,
        onProgress: (progress) => {
          lastProgress = progress;
          renderLoadingScreen(ctx, progress);
        },
      });
    } catch (err) {
      renderLoadingScreen(ctx, { ratio: lastProgress.ratio, label: lastProgress.label, error: err });
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

  chatMessages.innerHTML = '';
  chatPanel.classList.add('visible');

  const world = new World({ arenaConfig: room.arena, playerName });
  resize();

  const hud = new HudController();
  activeHud = hud;
  soundEngine.attachToWorld(world, { signal });
  hud.attachToWorld(world, { signal });

  connection.connect();
  connection.send('join', { roomId: room.id, name: playerName });

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
      chatPanel.classList.remove('visible');
      connection.send('leave');
      connection.disconnect();
      lobbyUi.show();
      lobby.startPolling();
    },
  });

  activeLoop = createLoop({
    step: (dt) => world.step(dt, activeInput.getState()),
    render: (alpha, stats) => {
      renderWorld(ctx, world, alpha, stats, { sprites: assets.sprites, hud });
    },
  });

  activeLoop.start();
}

const lobby = new Lobby({ endpoint: '/api/rooms', pollIntervalMs: 4000 });
const lobbyUi = mountLobbyDom(lobbyOverlay, lobby, {
  onJoinRequest: () => soundEngine.unlock(),
});

(async () => {
  const assets = await bootAssets();
  soundEngine.setBuffers(assets.sounds);

  lobby.addEventListener('joined', (e) => startGameSession(assets, e.detail));

  lobbyUi.show();
  lobby.startPolling();
})();