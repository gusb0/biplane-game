export type EventMap = Record<string, unknown>;

export class Bus<E extends EventMap> {
  private readonly listeners = new Map<keyof E, Set<(payload: never) => void>>();

  on<K extends keyof E>(event: K, handler: (payload: E[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const wrapped = handler as (payload: never) => void; // Generic event registry stores erased listener callbacks
    set.add(wrapped);
    return () => {
      set?.delete(wrapped);
    };
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of Array.from(set)) {
      (fn as (p: E[K]) => void)(payload);
    }
  }
}

export interface GameEvents {
  readonly status: { readonly state: "connecting" | "connected" | "reconnecting" | "error" | "disconnected" };
  readonly joined: { readonly roomName: string; readonly playerName: string };
  readonly roster: { readonly players: ReadonlyArray<{ readonly name: string; readonly slot: number }>; readonly joined?: string; readonly left?: string };
  readonly chat: { readonly name: string; readonly text: string };
  readonly snapshot: { readonly rttMs: number };
}