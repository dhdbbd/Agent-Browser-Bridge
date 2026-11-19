#!/usr/bin/env node
/**
 * 把 hook-inbox.mjs 注册到 ZCode 的 UserPromptSubmit（幂等，可重复运行）。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONFIG = join(homedir(), ".zcode", "cli", "config.json");
const HOOK = join(ROOT, "bridge", "hook-inbox.mjs");

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

if (!existsSync(CONFIG)) {
  console.error("找不到配置:", CONFIG);
  process.exit(1);
}

const raw = readFileSync(CONFIG, "utf8");
const cfg = JSON.parse(raw);

cfg.hooks = cfg.hooks || {};
cfg.hooks.enabled = true;
cfg.hooks.events = cfg.hooks.events || {};
const list = (cfg.hooks.events.UserPromptSubmit = cfg.hooks.events.UserPromptSubmit || []);

const already = JSON.stringify(list).includes("hook-inbox.mjs");
if (already) {
  console.log("已注册，无需重复添加");
} else {
  const backupDir = process.env.OFFICE_BACKUP_DIR || "D:\\J26060131\\backups";
  let dir = backupDir;
  if (!existsSync(dir)) {
    try { mkdirSync(dir, { recursive: true }); } catch (e) { dir = dirname(CONFIG); console.log("WARN 备份目录不可用，回退:", dir); }
  }
  const bak = join(dir, `config.jsonbackup-${stamp()}.json`);
  writeFileSync(bak, raw, "utf8");
  console.log("已备份:", bak);

  list.push({
    hooks: [
      {
        type: "process",
        command: process.execPath,
        args: [HOOK],
        timeoutMs: 5000,
        statusMessage: "读取浏览器侧栏指令"
      }
    ]
  });

  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2), "utf8");
  console.log("已注册 UserPromptSubmit hook:", HOOK);
}

console.log("\n当前 UserPromptSubmit hooks:");
for (const group of cfg.hooks.events.UserPromptSubmit) {
  for (const h of group.hooks || []) {
    console.log("  -", h.args ? h.args.join(" ") : h.command);
  }
}
