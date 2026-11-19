// 验证 --resume 是否保留上下文
import { spawn } from "node:child_process";

const CJS = "C:\\Users\\J26060131\\AppData\\Local\\Programs\\ZCode\\resources\\glm\\zcode.cjs";
const CWD = "C:\\Users\\J26060131\\ZCodeProject";

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CJS, ...args], { windowsHide: true });
    let out = "";
    let err = "";
    const t = setTimeout(() => { try { child.kill(); } catch (e) {} }, 180000);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("close", () => {
      clearTimeout(t);
      try {
        const s = out.indexOf("{");
        resolve({ ok: true, json: JSON.parse(out.slice(s)), raw: out, err });
      } catch (e) {
        resolve({ ok: false, raw: out, err });
      }
    });
  });
}

console.log("=== 第 1 次：建立暗号 ===");
const r1 = await run(["-p", "请记住：我的项目代号是 BLUE-42。只回复「记住了」。", "--json", "--cwd", CWD]);
console.log("sessionId:", r1.json?.sessionId);
console.log("response:", r1.json?.response);
console.log("turnCount:", r1.json?.projection?.turnCount, "contextUsed:", r1.json?.projection?.contextUsed);

if (!r1.json?.sessionId) {
  console.log("没拿到 sessionId，退出");
  process.exit(1);
}

console.log("\n=== 第 2 次：--resume 同一会话，问暗号 ===");
const r2 = await run(["--resume", r1.json.sessionId, "-p", "我的项目代号是什么？只回复代号。", "--json", "--cwd", CWD]);
console.log("sessionId:", r2.json?.sessionId);
console.log("response:", r2.json?.response);
console.log("turnCount:", r2.json?.projection?.turnCount, "contextUsed:", r2.json?.projection?.contextUsed);
if (r2.err) console.log("stderr:", r2.err.slice(0, 300));
