export function mountLobbyDom(container, lobby, { onJoinRequest } = {}) {
  container.innerHTML = `
    <div class="lobby-card">
      <div class="lobby-header">
        <div>
          <div class="lobby-title">Аеродром — Вибір кімнати (Lobby)</div>
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
        <select id="endpoint-mode-select" class="lobby-select" title="Режим тестування мережі">
          <option value="/api/rooms">Нормальна мережа (/api/rooms)</option>
          <option value="/api/rooms?delay=800">Повільна мережа (800 ms)</option>
          <option value="/api/rooms?fail=404">Тест збою: 404 Not Found</option>
          <option value="/api/rooms?fail=timeout">Тест збою: Timeout (3s)</option>
          <option value="/api/rooms?fail=badjson">Тест збою: Битий JSON</option>
        </select>
      </div>

      <div class="lobby-error" id="lobby-error"></div>
      <div class="room-list" id="lobby-room-list"></div>
    </div>
  `;

  const statusEl = container.querySelector('#lobby-status');
  const errorEl = container.querySelector('#lobby-error');
  const listEl = container.querySelector('#lobby-room-list');
  const nameInput = container.querySelector('#pilot-name-input');
  const refreshBtn = container.querySelector('#lobby-refresh-btn');
  const modeSelect = container.querySelector('#endpoint-mode-select');

  refreshBtn.addEventListener('click', () => {
    lobby.refresh();
  });

  modeSelect.addEventListener('change', () => {
    lobby.endpoint = modeSelect.value;
    lobby.refresh();
  });

  lobby.addEventListener('loading', (e) => {
    statusEl.textContent = `Оновлення: ${e.detail.endpoint}...`;
  });

  lobby.addEventListener('roomsChanged', (e) => {
    const rooms = e.detail;
    errorEl.classList.remove('visible');
    statusEl.textContent = `Онлайн · кімнат: ${rooms.length} (${new Date().toLocaleTimeString()})`;

    listEl.innerHTML = rooms
      .map(
        (room) => `
        <div class="room-item">
          <div>
            <div class="room-name">${room.name}</div>
            <div class="room-meta">
              Арена: ${room.arena.width}×${room.arena.height} · Міни: ${room.arena.asteroidCount} · Гравців: ${room.players}/${room.maxPlayers} · Ping: ${room.ping} ms
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
    statusEl.textContent = `Помилка запиту (${e.detail.name})`;
    errorEl.textContent = `Помилка: ${e.detail.message}. Натисніть «Оновити» або поверніть нормальний режим.`;
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