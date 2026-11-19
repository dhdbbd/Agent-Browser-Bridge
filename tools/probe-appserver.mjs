// 探测 ZCode app-server：初始化 → 列会话 → 建会话。只做只读+创建，不发消息。
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const CJS = "C:\\Users\\J26060131\\AppData\\Local\\Programs\\ZCode\\resources\\glm\\zcode.cjs";
if (!existsSync(CJS)) {
  console.log("找不到 zcode.cjs:", CJS);
  process.exit(1);
}

const p = spawn(process.execPath, [CJS, "app-server", "--stdio"], {
  stdio: "pipe",
  windowsHide: true
});

const t0 = Date.now();
const log = (...a) => console.log(`[${Date.now() - t0}ms]`, ...a);
let buf = "";

p.stdout.on("data", (d) => {
  buf += d.toString();
  // LSP 风格帧：Content-Length: N\r\n\r\n{...}
  for (;;) {
    const m = buf.match(/Content-Length:\s*(\d+)\r?\n\r?\n/);
    if (!m) break;
    const start = m.index + m[0].length;
    const len = Number(m[1]);
    if (buf.length - start < len) break;
    const body = buf.slice(start, start + len);
    buf = buf.slice(start + len);
    log("IN<", body.slice(0, 600));
  }
});
p.stderr.on("data", (d) => log("ERR>", d.toString().trim().slice(0, 300)));
p.on("exit", (c) => log("EXIT>", c));

function send(obj) {
  const s = JSON.stringify(obj);
  p.stdin.write(`Content-Length: ${Buffer.byteLength(s, "utf8")}\r\n\r\n${s}`);
  log("OUT>", s.slice(0, 200));
}

setTimeout(() => send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: 1, clientInfo: { name: "zcb-probe", version: "0.0.1" } } }), 1500);
setTimeout(() => send({ jsonrpc: "2.0", id: 2, method: "session/list", params: {} }), 3000);
setTimeout(() => send({ jsonrpc: "2.0", id: 3, method: "runtime/capabilities", params: {} }), 4500);
setTimeout(() => { log("kill"); p.kill(); process.exit(0); }, 9000);
