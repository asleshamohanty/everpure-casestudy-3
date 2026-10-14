// Forget all ownership changes made in the dashboard; the next `npm start` uses the CSV's owners again.
const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "..", "data", "state", "ownership.json");
fs.rmSync(file, { force: true });
console.log(`Ownership state reset (${path.relative(process.cwd(), file)} removed).`);
