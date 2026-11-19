import { readFileSync } from "node:fs";

const token = readFileSync(new URL("../bridge/.token", import.meta.url), "utf8").trim();

async function call(name, args) {
  const res = await fetch("http://127.0.0.1:8917/call", {
    method: "POST",
    headers: { "X-ZCBridge-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ name, args })
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error);
  return j.result;
}

const tabs = await call("browser_tabs", {});
const list = JSON.parse(tabs.content[0].text);
console.log("活动标签:");
for (const t of list) {
  console.log(`${t.active ? "*" : " "} [${t.id}] ${t.title} :: ${t.url.slice(0, 80)}`);
}

const target = list.find((t) => /^https?:/.test(t.url));
if (!target) {
  console.log("没有 http 页面");
  process.exit(0);
}

const expr = `JSON.stringify({
  host: !!document.querySelector('[data-zcb-launcher]'),
  shadow: !!(document.querySelector('[data-zcb-launcher]') || {}).shadowRoot,
  url: location.href
})`;

try {
  const snap = await call("browser_snapshot", { tabId: target.id, max: 5 });
  console.log("\nsnapshot 成功：");
  console.log(snap.content[0].text.split("\n").slice(0, 8).join("\n"));
} catch (e) {
  console.log("snapshot 失败:", e.message);
}

try {
  const r = await call("browser_eval", { expression: expr, tabId: target.id });
  console.log("\n注入检查:", r.content[0].text);
} catch (e) {
  console.log("eval 失败:", e.message);
}
