#!/usr/bin/env node
/**
 * 真实浏览器联调：
 *   node tools/smoke-live.mjs [url]
 * 1. 复用已有桥，或临时起一个
 * 2. 等扩展连上（最多 20 秒）
 * 3. 打开页面 → 文本化快照 → 打印
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PORT = 8917;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const token = readFileSync(join(ROOT, "bridge", ".token"), "utf8").trim();
const H = { "X-ZCBridge-Token": token, "Content-Type": "application/json" };
const targetUrl = process.argv[2] || "https://example.com/";

let child = null;

async function health() {
  try {
    return await fetch(`http://127.0.0.1:${PORT}/health`).then((r) => r.json());
  } catch (e) {
    return null;
  }
}

async function call(name, args) {
  const r = await fetch(`http://127.0.0.1:${PORT}/call`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ name, args })
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error);
  return j.result;
}

(async () => {
  let h = await health();
  if (!h) {
    console.log("没有运行中的桥，临时启动一个…");
    child = spawn(process.execPath, [join(ROOT, "bridge", "server.mjs")], { cwd: ROOT, stdio: ["pipe", "inherit", "inherit"] });
    await sleep(900);
    h = await health();
  }
  if (!h) {
    console.error("桥启动失败（端口被占用？）");
    process.exit(1);
  }
  console.log("桥状态:", JSON.stringify(h));

  let connected = h.extensionConnected;
  const deadline = Date.now() + 20000;
  while (!connected && Date.now() < deadline) {
    await sleep(600);
    const cur = await health();
    connected = cur && cur.extensionConnected;
  }

  if (!connected) {
    console.error("\n扩展还没连上。请确认：");
    console.error("  1. Chrome/Edge 已加载 browser-ext\\extension");
    console.error("  2. 点过扩展图标，侧栏打开过");
    console.error("  3. 扩展的 config.js 与 bridge/.token 的 token 一致");
    if (child) child.kill();
    process.exit(2);
  }

  console.log("扩展已连接，开始真实页面测试…\n");

  const st = await call("browser_status", {});
  console.log(st.content[0].text, "\n");

  const opened = await call("browser_open", { url: targetUrl });
  console.log(opened.content[0].text);
  await sleep(1200);

  const snap = await call("browser_snapshot", {});
  console.log("\n" + snap.content[0].text);

  console.log("\n完成。若要截一张图：node tools/smoke-live.mjs --screenshot");
  if (child) child.kill();
  process.exit(0);
})().catch((e) => {
  console.error("失败:", e.message);
  if (child) child.kill();
  process.exit(1);
});
