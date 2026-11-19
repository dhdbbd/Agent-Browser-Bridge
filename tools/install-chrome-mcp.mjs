#!/usr/bin/env node
/**
 * 注册第二个 MCP server：browser-ext-chrome（端口 8918）。
 * 幂等，可重复运行。会先备份 ~/.zcode/cli/config.json。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONFIG = join(homedir(), ".zcode", "cli", "config.json");

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

cfg.mcp = cfg.mcp || {};
cfg.mcp.servers = cfg.mcp.servers || {};

const existing = cfg.mcp.servers["browser-ext-chrome"];
if (existing) {
  console.log("已存在 browser-ext-chrome，更新配置");
} else {
  const backupDir = process.env.OFFICE_BACKUP_DIR || "D:\\J26060131\\backups";
  let dir = backupDir;
  if (!existsSync(dir)) {
    try { mkdirSync(dir, { recursive: true }); } catch (e) { dir = dirname(CONFIG); console.log("WARN 备份目录不可用，回退:", dir); }
  }
  const bak = join(dir, `config.jsonbackup-${stamp()}.json`);
  writeFileSync(bak, raw, "utf8");
  console.log("已备份:", bak);
}

cfg.mcp.servers["browser-ext-chrome"] = {
  type: "stdio",
  command: process.execPath,
  args: [join(ROOT, "bridge", "server.mjs")],
  env: { ZCB_PORT: "8918" },
  timeoutMs: 60000
};

writeFileSync(CONFIG, JSON.stringify(cfg, null, 2), "utf8");
console.log("已注册 MCP server: browser-ext-chrome（端口 8918）");
console.log("\n当前 MCP servers:");
for (const [name, def] of Object.entries(cfg.mcp.servers)) {
  const p = def.env && def.env.ZCB_PORT ? ` :${def.env.ZCB_PORT}` : "";
  console.log(`  - ${name}${p}`);
}
