export function renderNetgraph(ctx, { netWorld, connection, arenaWidth }) {
  const boxW = 295;
  const boxH = 126;
  const x = arenaWidth - boxW - 14;
  const y = 38;

  ctx.save();
  ctx.fillStyle = 'rgba(2, 6, 23, 0.84)';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, boxW, boxH);
  ctx.strokeRect(x, y, boxW, boxH);

  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.textAlign = 'left';
  ctx.fillText(
    `NETGRAPH [${connection.codec.toUpperCase()} · ${connection.lastSnapshotBytes}B/snap]`,
    x + 8,
    y + 15
  );

  ctx.font = '11px monospace';
  ctx.fillStyle = '#e2e8f0';
  const rtt = Math.round(connection.rttMs);
  const age = Math.round(netWorld.snapshotAgeMs);
  const downKb = (connection.bytesInPerSec / 1024).toFixed(2);
  const upKb = (connection.bytesOutPerSec / 1024).toFixed(2);
  const pending = netWorld.pendingInputs.length;
  const corr = netWorld.lastCorrectionPx.toFixed(2);

  ctx.fillText(`RTT: ${rtt} ms   | Snap Age: ${age} ms`, x + 8, y + 31);
  ctx.fillText(`Down: ${downKb} KB/s | Up: ${upKb} KB/s`, x + 8, y + 46);
  ctx.fillText(`Pending In: ${pending}  | Interp: ${netWorld.interpolationDelayMs} ms`, x + 8, y + 61);

  ctx.fillStyle = netWorld.lastCorrectionPx > 4 ? '#f87171' : '#4ade80';
  ctx.fillText(`Reconcile Correction: ${corr} px`, x + 8, y + 76);

  // Sparkline bars for RTT (cyan) & Correction (amber/red)
  const chartX = x + 8;
  const chartY = y + 84;
  const chartW = boxW - 16;
  const chartH = 34;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.fillRect(chartX, chartY, chartW, chartH);

  const hist = netWorld.correctionHistory;
  const stepW = chartW / 60;
  for (let i = 0; i < hist.length; i++) {
    const val = Math.min(30, hist[i]);
    const barH = Math.max(2, (val / 30) * (chartH - 4));
    ctx.fillStyle = val > 4 ? '#ef4444' : '#38bdf8';
    ctx.fillRect(chartX + i * stepW, chartY + chartH - barH, Math.max(1, stepW - 1), barH);
  }

  ctx.restore();
}