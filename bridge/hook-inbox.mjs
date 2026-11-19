#!/usr/bin/env node
/**
 * UserPromptSubmit hook：把侧栏的未读指令注入到当前提问的上下文里。
 * 没有未读时什么都不输出，不打扰正常对话。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function readStdin() {
  return new Promise((resolve) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => resolve(raw));
    process.stdin.on("error", () => resolve(raw));
    setTimeout(() => resolve(raw), 2000).unref?.();
  });
}

async function main() {
  await readStdin();

  let token = "";
  try {
    token = readFileSync(join(here, ".token"), "utf8").trim();
  } catch (e) {
    return;
  }
  if (!token) return;

  const res = await fetch("http://127.0.0.1:8917/inbox", {
    headers: { "X-ZCBridge-Token": token },
    signal: AbortSignal.timeout(3000)
  }).catch(() => null);
  if (!res || !res.ok) return;

  const data = await res.json().catch(() => null);
  const list = (data && data.unread) || [];
  if (!list.length) return;

  const lines = list
    .slice(-6)
    .map((m, i) => `${i + 1}. [${new Date(m.ts).toLocaleTimeString()}] ${String(m.text).slice(0, 300)}`)
    .join("\n");

  const context = [
    `## 浏览器侧栏有 ${list.length} 条未读指令`,
    lines,
    "处理方式：先调用 browser_inbox 取走这些指令，执行后用 browser_reply 把结果写回侧栏。"
  ].join("\n");

  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context } })
  );
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
