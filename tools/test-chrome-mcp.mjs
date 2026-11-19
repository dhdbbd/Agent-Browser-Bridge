import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(process.execPath, [join(ROOT, "bridge", "server.mjs")], {
  cwd: ROOT,
  env: { ...process.env, ZCB_PORT: "8918" },
  stdio: ["pipe", "pipe", "pipe"]
});

child.stdout.on("data", (d) => {
  for (const line of d.toString().split("\n")) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      if (j.id === 1) console.log("initialize OK");
      if (j.id === 2) {
        const txt = (j.result.content && j.result.content[0] && j.result.content[0].text) || "";
        console.log("browser_tabs 返回:");
        console.log(txt.slice(0, 600));
      }
    } catch (e) {}
  }
});
child.stderr.on("data", (d) => process.stderr.write("[chrome-mcp] " + d.toString()));

function send(o) {
  child.stdin.write(JSON.stringify(o) + "\n");
}

await sleep(900);
send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } });
await sleep(300);
send({ jsonrpc: "2.0", method: "notifications/initialized" });
send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "browser_tabs", arguments: {} } });
await sleep(2500);

child.kill();
process.exit(0);
