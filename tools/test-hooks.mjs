import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const token = readFileSync(join(ROOT, "bridge", ".token"), "utf8").trim();
const H = { "X-ZCBridge-Token": token, "Content-Type": "application/json" };

async function call(name, args) {
  const r = await fetch("http://127.0.0.1:8917/call", {
    method: "POST",
    headers: H,
    body: JSON.stringify({ name, args })
  });
  return r.json();
}

const opened = await call("browser_open", { url: "http://127.0.0.1:8757/" });
console.log("open:", opened.ok);
await new Promise((r) => setTimeout(r, 1500));

const snap = await call("browser_snapshot", { max: 3 });
console.log("snapshot ok:", snap.ok);
if (!snap.ok) console.log("错误:", snap.error);

const expr = `JSON.stringify({
  hooked: document.documentElement.hasAttribute('data-zcb-dialogs'),
  dialogs: document.documentElement.getAttribute('data-zcb-dialogs'),
  consoleAttr: document.documentElement.getAttribute('data-zcb-console')
})`;

const ev = await call("browser_eval", { expression: expr });
console.log("eval 原始:", JSON.stringify(ev).slice(0, 400));
