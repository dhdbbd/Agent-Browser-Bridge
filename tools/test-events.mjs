import { readFileSync } from "node:fs";

const token = readFileSync(new URL("../bridge/.token", import.meta.url), "utf8").trim();
const H = { "X-ZCBridge-Token": token, "Content-Type": "application/json" };

async function call(name, args) {
  const res = await fetch("http://127.0.0.1:8917/call", {
    method: "POST",
    headers: H,
    body: JSON.stringify({ name, args })
  });
  return res.json();
}

console.log("1) 调 browser_tabs …");
console.log(JSON.stringify(await call("browser_tabs", {})).slice(0, 200));

console.log("\n2) 写一条 reply …");
console.log(JSON.stringify(await call("browser_reply", { text: "测试：侧栏应实时显示这条回复" })).slice(0, 200));

console.log("\n3) 读事件流 …");
const r = await fetch("http://127.0.0.1:8917/events?since=0", { headers: H });
const j = await r.json();
for (const e of j.events || []) {
  console.log(`  [${e.seq}] ${e.type} ${e.name || ""} ${e.ok === undefined ? "" : e.ok ? "ok" : "fail"} ${e.ms ? e.ms + "ms" : ""} :: ${String(e.detail || e.text || "").slice(0, 70)}`);
}
