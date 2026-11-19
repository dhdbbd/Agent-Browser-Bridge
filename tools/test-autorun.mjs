import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const token = readFileSync(join(ROOT, "bridge", ".token"), "utf8").trim();
const H = { "X-ZCBridge-Token": token, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const text = process.argv[2] || "看一下浏览器现在开了哪些标签页，用 browser_reply 汇报标题和数量";
console.log("发送侧栏指令:", text);

const r = await fetch("http://127.0.0.1:8917/inbox", {
  method: "POST",
  headers: H,
  body: JSON.stringify({ text })
});
console.log("inbox:", JSON.stringify(await r.json()));

let lastSeq = 0;
const started = Date.now();
let lastEventAt = Date.now();

while (Date.now() - started < 240000) {
  await sleep(1200);
  const e = await fetch(`http://127.0.0.1:8917/events?since=${lastSeq}`, { headers: H }).then((x) => x.json()).catch(() => null);
  for (const ev of (e && e.events) || []) {
    lastSeq = Math.max(lastSeq, ev.seq || 0);
    lastEventAt = Date.now();
    const body = String(ev.detail || ev.text || "").replace(/\s+/g, " ").slice(0, 120);
    console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${ev.type} ${ev.name || ""} ${ev.ok === undefined ? "" : ev.ok ? "✓" : "✗"} ${ev.ms ? ev.ms + "ms" : ""} :: ${body}`);
  }
  const h = await fetch("http://127.0.0.1:8917/health", { headers: H }).then((x) => x.json()).catch(() => null);
  if (h && !h.running && Date.now() - lastEventAt > 12000) {
    console.log("\n执行结束");
    break;
  }
}
