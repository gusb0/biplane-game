import { fetchJson, withRetry } from '../assets/loader.js';

function createLinkedSignal(externalSignal, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'TimeoutError'));
  }, timeoutMs);

  const onExternalAbort = () => {
    clearTimeout(timeoutId);
    controller.abort(externalSignal.reason || new DOMException('Aborted', 'AbortError'));
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      onExternalAbort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    },
  };
}

export class Lobby extends EventTarget {
  #rooms = [];
  #pollTimer = null;
  #inFlightController = null;
  #visible = false;

  constructor({ endpoint = '/api/rooms', pollIntervalMs = 4000 } = {}) {
    super();
    this.endpoint = endpoint;
    this.pollIntervalMs = pollIntervalMs;
  }

  get rooms() {
    return this.#rooms;
  }

  get isVisible() {
    return this.#visible;
  }

  startPolling() {
    this.#visible = true;
    this.stopPolling(false);
    this.refresh();
    this.#pollTimer = setInterval(() => {
      if (this.#visible) {
        this.refresh();
      }
    }, this.pollIntervalMs);
  }

  stopPolling(hide = true) {
    if (hide) {
      this.#visible = false;
    }
    if (this.#pollTimer !== null) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = null;
    }
    if (this.#inFlightController) {
      this.#inFlightController.abort(new DOMException('Player left lobby', 'AbortError'));
      this.#inFlightController = null;
    }
  }

  async refresh() {
    if (this.#inFlightController) {
      this.#inFlightController.abort();
    }

    const requestController = new AbortController();
    this.#inFlightController = requestController;
    const { signal, cleanup } = createLinkedSignal(requestController.signal, 3000);

    this.dispatchEvent(new CustomEvent('loading', { detail: { endpoint: this.endpoint } }));

    try {
      const data = await withRetry(() => fetchJson(this.endpoint, { signal }), {
        attempts: 2,
        baseMs: 250,
        signal,
      });

      if (!this.#visible || signal.aborted) return;

      this.#rooms = Array.isArray(data.rooms) ? data.rooms : [];
      this.dispatchEvent(new CustomEvent('roomsChanged', { detail: this.#rooms }));
    } catch (err) {
      if (err?.name === 'AbortError' && !this.#visible) {
        return;
      }
      this.dispatchEvent(
        new CustomEvent('error', {
          detail: {
            message: err?.message || 'Не вдалося завантажити список кімнат',
            name: err?.name || 'Error',
          },
        })
      );
    } finally {
      cleanup();
      if (this.#inFlightController === requestController) {
        this.#inFlightController = null;
      }
    }
  }

  join(roomId, playerName = 'Pilot') {
    const chosenRoom = this.#rooms.find((r) => r.id === roomId) || this.#rooms[0];
    if (!chosenRoom) return;

    this.stopPolling(true);

    const cleanName = playerName.trim() || 'Pilot';
    this.dispatchEvent(
      new CustomEvent('joined', {
        detail: {
          room: chosenRoom,
          playerName: cleanName,
        },
      })
    );
  }
}