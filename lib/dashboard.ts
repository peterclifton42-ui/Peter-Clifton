import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_NAME } from "./brand";

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

// Inside the app the page already carries the app name, so the dashboard's own
// heading goes, the font matches the app's (--font in globals.css), and the
// tab bar stays pinned while the content scrolls.
const IN_APP_STYLE = `<style>
body,button,input,select,textarea{font-family:"Segoe UI",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif}
.hdr{display:none}
.tabs{position:sticky;top:0;z-index:100;box-shadow:0 6px 12px -8px rgba(0,0,0,.6)}
</style>`;
// Switching tabs from further down the page starts the new tab at its top.
const IN_APP_SCRIPT = `<script>
document.getElementById("tabBar").addEventListener("click",function(){var b=document.querySelector(".bb"),t=b?b.offsetTop+b.offsetHeight:0;if(window.scrollY>t)window.scrollTo(0,t)});
</script>`;

export async function renderDashboard(data: { basic?: { name?: string } }) {
  const [top, bottom] = await loadShell();
  const title = `${data.basic?.name ?? "Institution"} · ${APP_NAME}`;
  const shellTop = top.replace("__DASH_TITLE__", title).replace("<footer>Curinos Sales Intelligence ", `<footer>${APP_NAME} · `);
  const shellBottom = bottom.replace("</body>", `${IN_APP_STYLE}\n${IN_APP_SCRIPT}\n</body>`);
  return `${shellTop}\nconst D = ${scriptSafeJson(data)};\n${shellBottom}`;
}
