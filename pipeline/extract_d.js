// Lift the D data object out of a built dashboard and save it as JSON.
// Usage: node extract_d.js dashboard.html out.json
const fs = require("fs");
const vm = require("vm");

const [htmlPath, outPath] = process.argv.slice(2);
const html = fs.readFileSync(htmlPath, "utf8");
const start = html.indexOf("const D = {};");
if (start < 0) throw new Error("no D block in dashboard");
const block = html.slice(start, html.indexOf("\n\n", start));
const stray = block.split("\n").find((l) => !(l.startsWith("D.") || l.startsWith("const D")));
if (stray) throw new Error(`unexpected line in D block: ${stray.slice(0, 80)}`);

// The block is only object-literal assignments; run it in an empty context.
const ctx = vm.createContext({});
vm.runInContext(`${block}\nglobalThis.__D = D;`, ctx, { timeout: 2000 });
fs.writeFileSync(outPath, JSON.stringify(ctx.__D));
