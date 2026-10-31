import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_NAME } from "./brand";
import { DASHBOARD_TABS } from "./dashboard-tabs";

// Rebuilds a bank's dashboard exactly as build_v2.py does:
// SHELL_TOP + the bank's D object + SHELL_BOTTOM.
let shell: Promise<[string, string]> | null = null;

function loadShell() {
  shell ??= Promise.all([
    readFile(path.join(process.cwd(), "reference", "SHELL_TOP.html"), "utf8"),
    readFile(path.join(process.cwd(), "reference", "SHELL_BOTTOM.html"), "utf8"),
  ]).then(([top, bottom]) => {
    // The stylesheet sits before the inlined chart library; only it gets rescaled.
    const css = top.indexOf("</style>", top.indexOf("<style", 200));
    return [readable(top.slice(0, css)) + top.slice(css), readable(bottom)] as [string, string];
  });
  return shell;
}

// The dashboard template uses many 8-11px labels and 28-64px numbers. Text is
// rescaled to a 12px floor and a calmer top end, in CSS, inline styles and chart
// labels alike, so every dashboard reads the same without being rebuilt.
const SCALE: Record<number, number> = {
  8: 12, 9: 12, 10: 12, 11: 12.5, 12: 13, 13: 14, 14: 14.5, 15: 15.5, 16: 16, 17: 17, 18: 17,
  20: 19, 22: 20, 24: 21, 28: 24, 32: 26, 52: 36, 64: 42,
};
function readable(text: string) {
  return text
    .replace(/font-size:\s*(\d+)px/g, (m, n) => (SCALE[Number(n)] ? `font-size:${SCALE[Number(n)]}px` : m))
    .replace(/font:\{size:(\d+)\}/g, (m, n) => (Number(n) < 12 ? "font:{size:12}" : m));
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
body{line-height:1.5}
.official-peers{margin:0 0 14px;padding:12px 14px;border-radius:8px;background:rgba(57,135,229,.12);border:1px solid rgba(57,135,229,.45);font-size:14px}
.official-peers a{color:#60a5fa;font-weight:600;margin-left:4px}
.highlighted{outline:2px solid #3987e5;outline-offset:4px;border-radius:6px;transition:outline-color .6s}
</style>`;
// Switching tabs from further down the page starts the new tab at its top.
const IN_APP_SCRIPT = `<script>
document.getElementById("tabBar").addEventListener("click",function(){var b=document.querySelector(".bb"),t=b?b.offsetTop+b.offsetHeight:0;if(window.scrollY>t)window.scrollTo(0,t)});
</script>`;

export type RenderOptions = {
  open?: { tab: string; at?: string | null } | null; // open on this tab, scrolled to this section id
  compareHref?: string | null; // the official peer comparison, linked from the Peer Comparison tab
};

export async function renderDashboard(data: { basic?: { name?: string } }, opts: RenderOptions = {}) {
  const [top, bottom] = await loadShell();
  const title = `${data.basic?.name ?? "Institution"} · ${APP_NAME}`;
  const shellTop = top.replace("__DASH_TITLE__", title).replace("<footer>Curinos Sales Intelligence ", `<footer>${APP_NAME} · `);
  const tab = opts.open && (DASHBOARD_TABS as readonly string[]).includes(opts.open.tab) ? opts.open.tab : null;
  const at = opts.open?.at && /^[a-z][a-z0-9-]{1,40}$/.test(opts.open.at) ? opts.open.at : null;
  // Opening on a tab: set it before the first render, then scroll to the section.
  const openScript = tab ? `<script>tab=${JSON.stringify(tab)};rt();rc();${at ? `setTimeout(function(){var e=document.getElementById(${JSON.stringify(at)});if(e){e.scrollIntoView({block:"start"});var h=e.classList.contains("section-anchor")&&e.nextElementSibling||e;h.classList.add("highlighted");setTimeout(function(){h.classList.remove("highlighted")},2500)}},150);` : ""}</script>` : "";
  // The Peer Comparison tab leads with a link to the official call report comparison.
  const peerScript = opts.compareHref ? `<script>(function(){var orig=rc;rc=function(){orig();if(tab==="Peer Comparison"){var el=document.getElementById("mc"),d=document.createElement("div");d.className="official-peers";d.innerHTML='<b>Official figures:</b> compare this bank with its peer group on FDIC/NCUA call report data, the same definitions for every bank. <a href="${opts.compareHref.replace(/["'<>]/g, "")}" target="_blank" rel="noopener">Open the official comparison ↗</a>';el.insertBefore(d,el.firstChild)}};if(tab==="Peer Comparison")rc()})()</script>` : "";
  const shellBottom = bottom.replace("</body>", `${IN_APP_STYLE}\n${IN_APP_SCRIPT}\n${peerScript}\n${openScript}\n</body>`);
  return `${shellTop}\nconst D = ${scriptSafeJson(data)};\n${shellBottom}`;
}
