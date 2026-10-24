import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Rebuilds a bank's dashboard exactly as build_v2.py does:
// SHELL_TOP + the bank's D object + SHELL_BOTTOM.
let shell: Promise<[string, string]> | null = null;

function loadShell() {
  shell ??= Promise.all([
    readFile(path.join(process.cwd(), "reference", "SHELL_TOP.html"), "utf8"),
    readFile(path.join(process.cwd(), "reference", "SHELL_BOTTOM.html"), "utf8"),
  ]);
  return shell;
}

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

// JSON embedded in a <script> must not be able to close the tag.
function scriptSafeJson(value: unknown) {
  return JSON.stringify(value)
    .split("<").join("\\u003c")
    .split(LINE_SEPARATOR).join("\\u2028")
    .split(PARAGRAPH_SEPARATOR).join("\\u2029");
}

export async function renderDashboard(data: { basic?: { name?: string } }) {
  const [top, bottom] = await loadShell();
  const title = `${data.basic?.name ?? "Institution"} Sales Intelligence`;
  return `${top.replace("__DASH_TITLE__", title)}\nconst D = ${scriptSafeJson(data)};\n${bottom}`;
}
