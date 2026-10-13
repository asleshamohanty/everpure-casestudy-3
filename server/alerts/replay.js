// The CSV has no timestamps, so we REPLAY the 20 snapshots as if they were live.
// Every few seconds we "receive" the next snapshot and run it through the alerter.
const { createAlerter } = require("./engine");

function startReplay(rows, onAlert, { intervalMs = 3000 } = {}) {
  const maxSnapshot = Math.max(...rows.map((r) => r.snapshot));
  let snapshot = 1;
  let alerter = createAlerter();

  const timer = setInterval(() => {
    const batch = rows.filter((r) => r.snapshot === snapshot);
    for (const row of batch) {
      for (const alert of alerter(row)) onAlert(alert);
    }
    console.log(`[replay] snapshot ${snapshot}/${maxSnapshot} processed`);
    snapshot += 1;
    if (snapshot > maxSnapshot) {           // loop forever for the demo
      snapshot = 1;
      alerter = createAlerter();            // fresh state each loop
    }
  }, intervalMs);

  return () => clearInterval(timer);       // call this to stop the replay
}

module.exports = { startReplay };