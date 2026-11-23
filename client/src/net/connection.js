export class GameConnection extends EventTarget {
  #socket = null;
  #queue = [];
  #shouldReconnect = false;
  #attempt = 0;
  #reconnectTimer = null;
  #lastJoinPayload = null;

  constructor({ url } = {}) {
    super();
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = url || `${proto}//${window.location.host}/ws`;
  }

  get isOpen() {
    return this.#socket?.readyState === WebSocket.OPEN;
  }

  connect() {
    this.#shouldReconnect = true;
    if (
      this.#socket &&
      (this.#socket.readyState === WebSocket.OPEN || this.#socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.dispatchEvent(new CustomEvent('status', { detail: { state: 'connecting' } }));
    const ws = new WebSocket(this.url);
    this.#socket = ws;

    ws.onopen = () => {
      this.#attempt = 0;
      this.dispatchEvent(new CustomEvent('status', { detail: { state: 'connected' } }));

      if (this.#lastJoinPayload) {
        ws.send(JSON.stringify(this.#lastJoinPayload));
      }

      while (this.#queue.length > 0 && ws.readyState === WebSocket.OPEN) {
        ws.send(this.#queue.shift());
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg?.type) {
          this.dispatchEvent(new CustomEvent(msg.type, { detail: msg }));
        }
      } catch (err) {
        console.warn('[ws-client] Failed to parse server packet:', err);
      }
    };

    ws.onerror = () => {
      this.dispatchEvent(new CustomEvent('status', { detail: { state: 'error' } }));
    };

    ws.onclose = (event) => {
      this.#socket = null;
      this.dispatchEvent(
        new CustomEvent('disconnected', { detail: { code: event.code, reason: event.reason } })
      );

      if (this.#shouldReconnect && event.code !== 1000 && event.code !== 1008 && event.code !== 1009) {
        const delayMs = Math.min(8000, 400 * 2 ** this.#attempt) + Math.floor(Math.random() * 200);
        this.#attempt += 1;
        this.dispatchEvent(
          new CustomEvent('status', { detail: { state: 'reconnecting', delayMs } })
        );
        this.#reconnectTimer = setTimeout(() => this.connect(), delayMs);
      }
    };
  }

  send(type, payload = {}) {
    const packetObj = { v: 1, type, ...payload };
    if (type === 'join') {
      this.#lastJoinPayload = packetObj;
    }
    const serialized = JSON.stringify(packetObj);

    if (this.isOpen) {
      this.#socket.send(serialized);
    } else {
      this.#queue.push(serialized);
      if (!this.#socket) {
        this.connect();
      }
    }
  }

  disconnect() {
    this.#shouldReconnect = false;
    this.#lastJoinPayload = null;
    this.#queue = [];
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    if (this.#socket) {
      this.#socket.close(1000, 'Client left');
      this.#socket = null;
    }
  }
}