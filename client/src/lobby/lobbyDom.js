export function mountLobbyDom(container, lobby, { onJoinRequest } = {}) {
  container.innerHTML = `
    <div class="lobby-card">
      <div class="lobby-header">
        <div>
          <div class="lobby-title">Аеродром — Кімнати сервера (WebSocket Lobby)</div>
          <div class="lobby-status" id="lobby-status">GET /api/rooms · очікування...</div>
        </div>
        <button class="btn btn-secondary" id="lobby-refresh-btn" type="button">Оновити</button>
      </div>

      <div class="lobby-controls">
        <input
          id="pilot-name-input"
          class="lobby-input"
          type="text"
          maxlength="20"
          placeholder="Позивний пілота"
          value="Valeriia"
        />
        <input
          id="new-room-input"
          class="lobby-input"
          type="text"
          maxlength="30"
          placeholder="Назва нової кімнати..."
        />
        <button class="btn btn-secondary" id="create-room-btn" type="button">+ Створити</button>
      </div>

      <div class="lobby-error" id="lobby-error"></div>
      <div class="room-list" id="lobby-room-list"></div>
    </div>
  `;

  const statusEl = container.querySelector('#lobby-status');
  const errorEl = container.querySelector('#lobby-error');
  const listEl = container.querySelector('#lobby-room-list');
  const nameInput = container.querySelector('#pilot-name-input');
  const newRoomInput = container.querySelector('#new-room-input');
  const createRoomBtn = container.querySelector('#create-room-btn');
  const refreshBtn = container.querySelector('#lobby-refresh-btn');

  refreshBtn.addEventListener('click', () => lobby.refresh());

  createRoomBtn.addEventListener('click', async () => {
    const roomName = newRoomInput.value.trim();
    if (!roomName) return;
    try {
      errorEl.classList.remove('visible');
      await lobby.createRoom(roomName);
      newRoomInput.value = '';
    } catch (err) {
      errorEl.textContent = `Не вдалося створити кімнату: ${err.message}`;
      errorEl.classList.add('visible');
    }
  });

  lobby.addEventListener('loading', (e) => {
    statusEl.textContent = `Запит: ${e.detail.endpoint}...`;
  });

  lobby.addEventListener('roomsChanged', (e) => {
    const rooms = e.detail;
    errorEl.classList.remove('visible');
    statusEl.textContent = `Сервер онлайн · кімнат: ${rooms.length} (${new Date().toLocaleTimeString()})`;

    listEl.innerHTML = rooms
      .map(
        (room) => `
        <div class="room-item">
          <div>
            <div class="room-name">${room.name}</div>
            <div class="room-meta">
              ID: ${room.id} · Арена: ${room.arena.width}×${room.arena.height} · Гравців у кімнаті: <b>${room.players}/${room.maxPlayers}</b>
            </div>
          </div>
          <button class="btn join-room-btn" data-room-id="${room.id}" type="button">Join</button>
        </div>
      `
      )
      .join('');

    listEl.querySelectorAll('.join-room-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        onJoinRequest?.();
        lobby.join(btn.dataset.roomId, nameInput.value);
      });
    });
  });

  lobby.addEventListener('error', (e) => {
    statusEl.textContent = `Помилка (${e.detail.name})`;
    errorEl.textContent = `Помилка мережі: ${e.detail.message}`;
    errorEl.classList.add('visible');
  });

  lobby.addEventListener('joined', () => {
    container.classList.remove('visible');
  });

  return {
    show() {
      container.classList.add('visible');
    },
    hide() {
      container.classList.remove('visible');
    },
  };
}