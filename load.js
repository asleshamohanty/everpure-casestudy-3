const fs = require("fs");
const { parse } = require("csv-parse/sync");

// read file as one text
const text = fs.readFileSync("data/raw/reports.csv", "utf8");

// turn text to array one per row
const rows = parse(text, { columns: true });

console.log("Rows:", rows.length);
console.log("First row:", rows[0]);