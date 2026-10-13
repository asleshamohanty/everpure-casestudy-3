// The CSV has no timestamps, so we REPLAY the 20 snapshots as if they were live.
// Every few seconds the next snapshot "arrives": we report it (so the dashboard can
// refresh its health view) and run every row through the alert engine.
const { createAlerter } = require("./engine");

function startReplay(rows, { onAlert, onSnapshot, intervalMs = 3000 }) {
  const maxSnapshot = Math.max(...rows.map((r) => r.snapshot));
  let snapshot = 1;
  let alerter = createAlerter();

  function tick() {
    const batch = rows.filter((r) => r.snapshot === snapshot);
    onSnapshot(snapshot, maxSnapshot);
    for (const row of batch) {
      for (const alert of alerter(row)) onAlert(alert);
    }
    snapshot += 1;
    if (snapshot > maxSnapshot) {           // loop forever for the demo
      snapshot = 1;
      alerter = createAlerter();            // fresh state each loop
    }
  }

  tick();                                   // first snapshot immediately, so the dashboard is never empty
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);        // call this to stop the replay
}

module.exports = { startReplay };
