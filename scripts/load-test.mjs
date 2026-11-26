import WebSocket from "ws";

const counts = [8, 32, 64, 128];
const targetUrl = process.env.WS_URL || "ws://localhost:3000";

async function runLoad(n) {
  const start = performance.now();
  const sockets = [];
  for (let i = 0; i < n; i++) {
    const ws = new WebSocket(targetUrl);
    sockets.push(ws);
  }
  await new Promise((r) => setTimeout(r, 300));
  for (const ws of sockets) {
    try { ws.close(); } catch {}
  }
  const elapsed = (performance.now() - start).toFixed(1);
  console.log(`clients=${n} elapsedMs=${elapsed} rssMb=${(process.memoryUsage().rss / 1048576).toFixed(1)}`);
}

for (const n of counts) {
  await runLoad(n);
}
