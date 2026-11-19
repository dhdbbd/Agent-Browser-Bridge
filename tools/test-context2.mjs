import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const token = readFileSync(join(ROOT, "bridge", ".token"), "utf8").trim();
const H = { "X-ZCBridge-Token": token, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const before = await fetch("http://127.0.0.1:8917/session", { headers: H }).then((r) => r.json());
console.log("当前历史:", JSON.stringify(before));

const text = process.argv[2] || "我的测试暗号是什么？只回复代号本身，不要解释。";
console.log("\n>>> 发送:", text);
await fetch("http://127.0.0.1:8917/inbox", { method: "POST", headers: H, body: JSON.stringify({ text }) });

let lastSeq = 0;
const started = Date.now();
let idle = 0;
while (Date.now() - started < 240000) {
  await sleep(1500);
  const e = await fetch(`http://127.0.0.1:8917/events?since=${lastSeq}`, { headers: H }).then((r) => r.json());
  for (const ev of e.events || []) {
    lastSeq = Math.max(lastSeq, ev.seq || 0);
    const body = String(ev.detail || ev.text || "").replace(/\s+/g, " ").slice(0, 160);
    console.log(`  ${ev.type} ${ev.name || ""} :: ${body}`);
  }
  const h = await fetch("http://127.0.0.1:8917/health", { headers: H }).then((r) => r.json());
  if (h.running) idle = 0;
  else if (++idle >= 4) break;
}

const after = await fetch("http://127.0.0.1:8917/session", { headers: H }).then((r) => r.json());
console.log("\n执行后历史:", JSON.stringify(after));
