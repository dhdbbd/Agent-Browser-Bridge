#!/usr/bin/env node
/**
 * 安装/更新 ZCode Browser Bridge：
 * 1. 生成（或复用）桥接 token，写入 bridge/.token 与 extension/config.js
 * 2. 备份并更新 ~/.zcode/cli/config.json，注册 browser-ext MCP server
 * 3. 打印浏览器扩展的加载步骤
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const CONFIG = join(homedir(), ".zcode", "cli", "config.json");
const TOKEN_FILE = join(ROOT, "bridge", ".token");
const EXT_CONFIG = join(ROOT, "extension", "config.js");
const PORT = 8917;

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function backupConfig() {
  const preferred = process.env.OFFICE_BACKUP_DIR || "D:\\J26060131\\backups";
  let dir = preferred;
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch (e) {
      dir = dirname(CONFIG);
      console.log(`WARN 备份目录不可用，回退到配置同目录: ${dir}`);
    }
  }
  const target = join(dir, `config.jsonbackup-${stamp()}.json`);
  writeFileSync(target, readFileSync(CONFIG, "utf8"), "utf8");
  return target;
}

// 1) token
let token = "";
if (existsSync(TOKEN_FILE)) {
  token = readFileSync(TOKEN_FILE, "utf8").trim();
}
if (!token) {
  token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  writeFileSync(TOKEN_FILE, token, "utf8");
  console.log("已生成新 token:", TOKEN_FILE);
}

writeFileSync(
  EXT_CONFIG,
  `// 由 install.mjs 自动生成；如需改端口/token，重跑 install.mjs 而不是手改这里。\nexport const BRIDGE = {\n  port: ${PORT},\n  token: "${token}"\n};\n`,
  "utf8"
);
console.log("已写入扩展配置:", EXT_CONFIG);

// 2) 注册 MCP
if (!existsSync(CONFIG)) {
  console.error("找不到 ZCode 配置:", CONFIG);
  console.error("请先运行一次 ZCode 客户端，或手动在该路径创建 config.json。");
  process.exit(1);
}

const backupPath = backupConfig();
console.log("已备份配置:", backupPath);

const raw = readFileSync(CONFIG, "utf8");
let cfg;
try {
  cfg = JSON.parse(raw);
} catch (e) {
  console.error("config.json 不是合法 JSON，已保留备份，未做修改:", e.message);
  process.exit(1);
}

cfg.mcp = cfg.mcp || {};
cfg.mcp.servers = cfg.mcp.servers || {};
cfg.mcp.servers["browser-ext"] = {
  type: "stdio",
  command: process.execPath,
  args: [join(ROOT, "bridge", "server.mjs")],
  env: { ZCB_PORT: String(PORT) },
  timeoutMs: 60000
};

writeFileSync(CONFIG, JSON.stringify(cfg, null, 2), "utf8");
console.log("已注册 MCP server: browser-ext");

console.log("\n================ 下一步 ================");
console.log("1. 打开 Chrome 或 Edge，地址栏输入:");
console.log("     chrome://extensions    或    edge://extensions");
console.log("2. 打开右上角「开发者模式」");
console.log("3. 点「加载已解压的扩展程序」，选择目录:");
console.log("     " + join(ROOT, "extension"));
console.log("4. 点扩展图标 → 侧栏会出现在浏览器右侧");
console.log("5. 重启 ZCode 会话（或新开一个），让 browser-ext 工具加载");
console.log("6. 在 ZCode 里说「看看浏览器连接状态」，应看到 browser_status 可用");
console.log("========================================");
