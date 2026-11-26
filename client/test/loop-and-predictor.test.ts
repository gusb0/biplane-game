import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLoop } from "../src/loop.js";
import { ClientNetworkWorld } from "../src/net/predictor.js";

describe("Client: game loop with fake timers & network world", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      return setTimeout(() => {
        now += 16.67;
        cb(now);
      }, 16) as unknown as number;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("advances fixed simulation steps and renders frames under fake timers", () => {
    let stepCalls = 0;
    let renderCalls = 0;

    const loop = createLoop({
      fixedHz: 30,
      step: () => {
        stepCalls += 1;
      },
      render: () => {
        renderCalls += 1;
      },
    });

    loop.start();
    vi.advanceTimersByTime(100);
    loop.stop();

    expect(stepCalls).toBeGreaterThanOrEqual(2);
    expect(renderCalls).toBeGreaterThanOrEqual(3);
  });

  it("stops calling step and render after stop()", () => {
    let stepCalls = 0;
    const loop = createLoop({
      fixedHz: 30,
      step: () => {
        stepCalls += 1;
      },
      render: () => {},
    });

    loop.start();
    vi.advanceTimersByTime(50);
    loop.stop();
    const countAtStop = stepCalls;
    vi.advanceTimersByTime(100);
    expect(stepCalls).toBe(countAtStop);
  });

  it("tracks roster names and sends inputs via ClientNetworkWorld", () => {
    const sent: unknown[] = [];
    const conn = {
      sendInput(pkt: unknown) {
        sent.push(pkt);
      },
    };
    const netWorld = new ClientNetworkWorld({ playerName: "Tester" });
    netWorld.setRoster([
      { slot: 0, name: "Tester" },
      { slot: 1, name: "Wingman" },
    ]);

    netWorld.stepLocal({ thrust: true, brake: false, left: false, right: false, fire: false }, conn);
    netWorld.stepLocal({ thrust: true, brake: false, left: true, right: false, fire: true }, conn);

    expect(sent.length).toBe(2);
    expect(netWorld.localTick).toBe(2);
    expect(netWorld.rosterNames.get(1)).toBe("Wingman");
  });

  it("resets roster cleanly when given empty or undefined list", () => {
    const netWorld = new ClientNetworkWorld({ playerName: "Solo" });
    netWorld.setRoster([{ slot: 2, name: "Ghost" }]);
    expect(netWorld.rosterNames.size).toBe(1);
    netWorld.setRoster(undefined);
    expect(netWorld.rosterNames.size).toBe(0);
  });
});
