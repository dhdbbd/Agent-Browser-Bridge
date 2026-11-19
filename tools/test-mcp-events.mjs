import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const token = readFileSync(join(ROOT, "bridge", ".token"), "utf8").trim();
const H = { "X-ZCBridge-Token": token, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(process.execPath, [join(ROOT, "bridge", "server.mjs")], {
  cwd: ROOT,
  stdio: ["pipe", "pipe", "pipe"]
});
child.stdout.on("data", (d) => process.stdout.write("MCP> " + d.toString().slice(0, 300)));
child.stderr.on("data", (d) => process.stderr.write("[srv] " + d.toString()));

function send(o) {
  child.stdin.write(JSON.stringify(o) + "\n");
}

await sleep(900);
send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } });
await sleep(200);
send({ jsonrpc: "2.0", method: "notifications/initialized" });
send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "browser_tabs", arguments: {} } });
await sleep(1500);
send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "browser_reply", arguments: { text: "MCP 路径事件测试" } } });
await sleep(1000);

const r = await fetch("http://127.0.0.1:8917/events?since=0", { headers: H });
const j = await r.json();
console.log("\n=== 主桥事件流 ===");
for (const e of j.events || []) {
  console.log(`[${e.seq}] ${e.type} ${e.name || ""} ${e.ok === undefined ? "" : e.ok ? "✓" : "✗"} ${e.ms ? e.ms + "ms" : ""} :: ${String(e.detail || e.text || "").slice(0, 60)}`);
}

child.kill();
process.exit(0);
