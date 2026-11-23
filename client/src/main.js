import { setupCanvas } from './render/canvas.js';
import { renderNetworkScene } from './render/draw.js';
import { renderLoadingScreen } from './render/loadingScreen.js';
import { loadAll } from './assets/loader.js';
import { SoundEngine } from './audio/audio.js';
import { HudController } from './ui/hud.js';
import { createInput } from './input.js';
import { createLoop } from './loop.js';
import { Lobby } from './lobby/lobby.js';
import { mountLobbyDom } from './lobby/lobbyDom.js';
import { GameConnection } from './net/connection.js';
import { ClientNetworkWorld } from './net/predictor.js';

const canvas = document.getElementById('game');
const lobbyOverlay = document.getElementById('lobby-overlay');
const netControls = document.getElementById('net-controls');
const ctrlNetSim = document.getElementById('ctrl-netsim');
const ctrlPredict = document.getElementById('ctrl-predict');
const ctrlInterp = document.getElementById('ctrl-interp');
const ctrlCodec = document.getElementById('ctrl-codec');
const ctrlRandBug = document.getElementById('ctrl-rand-bug');

const chatPanel = document.getElementById('chat-panel');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

const { ctx, resize } = setupCanvas(canvas);
const soundEngine = new SoundEngine();
const connection = new GameConnection();

let activeLoop = null;
let activeInput = null;
let activeHud = null;
let activeNetWorld = null;

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

// Live NetSim & Netcode controls
ctrlNetSim.addEventListener('change', () => {
  const [delayMs, jitterMs, dropRate] = ctrlNetSim.value.split(',').map(Number);
  connection.send('net_config', { delayMs, jitterMs, dropRate });
});

ctrlPredict.addEventListener('change', () => {
  if (activeNetWorld) activeNetWorld.predictionEnabled = ctrlPredict.checked;
});

ctrlInterp.addEventListener('change', () => {
  if (activeNetWorld) activeNetWorld.interpolationDelayMs = Number(ctrlInterp.value);
});

ctrlCodec.addEventListener('change', () => {
  connection.codec = ctrlCodec.value;
  connection.send('net_config', { codec: ctrlCodec.value });
});

ctrlRandBug.addEventListener('change', () => {
  if (activeNetWorld) activeNetWorld.breakDeterminism = ctrlRandBug.checked;
});

connection.addEventListener('status', (e) => activeHud?.setWsState(e.detail.state));

connection.addEventListener('joined', (e) => {
  const { players, room } = e.detail;
  activeHud?.setRoster(players);
  activeNetWorld?.setRoster(players);
  appendChatLine(`Ви увійшли в бій «${room.name}» (30 Hz Authoritative)`, true);
});

connection.addEventListener('roster', (e) => {
  const { players, joined, left } = e.detail;
  activeHud?.setRoster(players);
  activeNetWorld?.setRoster(players);
  if (joined) appendChatLine(`+ ${joined.name} увійшов у бій`, true);
  if (left) appendChatLine(`- ${left.name} залишив бій`, true);
});

connection.addEventListener('snapshot', (e) => {
  activeNetWorld?.onSnapshot(e.detail, connection.rttMs);
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

function startGameSession({ room, playerName }) {
  if (activeLoop) activeLoop.stop();
  if (activeInput) activeInput.destroy();

  chatMessages.innerHTML = '';
  chatPanel.classList.add('visible');
  netControls.classList.add('visible');

  const netWorld = new ClientNetworkWorld({ arena: room.arena, playerName });
  netWorld.predictionEnabled = ctrlPredict.checked;
  netWorld.interpolationDelayMs = Number(ctrlInterp.value);
  netWorld.breakDeterminism = ctrlRandBug.checked;
  activeNetWorld = netWorld;

  resize();

  const hud = new HudController();
  activeHud = hud;

  connection.codec = ctrlCodec.value;
  connection.connect();
  connection.send('join', { roomId: room.id, name: playerName });

  activeInput = createInput(canvas, {
    onFire: () => soundEngine.unlock(),
    onOpenLobby: () => {
      if (activeLoop) activeLoop.stop();
      chatPanel.classList.remove('visible');
      netControls.classList.remove('visible');
      connection.send('leave');
      connection.disconnect();
      lobbyUi.show();
      lobby.startPolling();
    },
  });

  // Fixed 30 Hz network input & prediction step
  activeLoop = createLoop({
    fixedHz: 30,
    step: () => netWorld.stepLocal(activeInput.getState(), connection),
    render: (_alpha, stats) => {
      renderNetworkScene(ctx, { netWorld, connection, stats, hud });
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

  lobby.addEventListener('joined', (e) => startGameSession(e.detail));

  lobbyUi.show();
  lobby.startPolling();
})();