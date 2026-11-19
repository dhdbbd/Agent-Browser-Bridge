import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const token = readFileSync(join(ROOT, "bridge", ".token"), "utf8").trim();
const H = { "X-ZCBridge-Token": token, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastSeq = 0;

async function health() {
  return fetch("http://127.0.0.1:8917/health", { headers: H }).then((r) => r.json());
}

async function drain(label) {
  const e = await fetch(`http://127.0.0.1:8917/events?since=${lastSeq}`, { headers: H }).then((r) => r.json());
  for (const ev of e.events || []) {
    lastSeq = Math.max(lastSeq, ev.seq || 0);
    const body = String(ev.detail || ev.text || "").replace(/\s+/g, " ").slice(0, 150);
    console.log(`  [${label}] ${ev.type} ${ev.name || ""} :: ${body}`);
  }
}

async function sendAndWait(text, label) {
  console.log(`\n>>> ${label}: ${text}`);
  await fetch("http://127.0.0.1:8917/inbox", {
    method: "POST",
    headers: H,
    body: JSON.stringify({ text })
  });
  const started = Date.now();
  let idle = 0;
  while (Date.now() - started < 240000) {
    await sleep(1500);
    await drain(label);
    const h = await health();
    if (h.running) idle = 0;
    else {
      idle++;
      if (idle >= 4) break;
    }
  }
  const s = await fetch("http://127.0.0.1:8917/session", { headers: H }).then((r) => r.json());
  console.log(`  [session] turns=${s.turns} contextUsed=${s.contextUsed} history=${s.historyCount} id=${s.id.slice(0, 20)}`);
}

await sendAndWait("请记住：我的测试暗号是 GREEN-77。只回复「记住了」，不要做其他事。", "第1轮");
await sendAndWait("我的测试暗号是什么？只回复代号本身，不要解释。", "第2轮");
