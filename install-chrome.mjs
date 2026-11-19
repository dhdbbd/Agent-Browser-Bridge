#!/usr/bin/env node
/**
 * 安装/更新 Chrome 专用实例（端口 8918）：
 * 1. 复用或生成桥 token，写入 extension-chrome/config.js
 * 2. 注册 MCP server: browser-ext-chrome
 * 3. 配置开机自启（Chrome 桥）
 * 4. 打印加载指引
 *
 * 先跑过 install.mjs 再跑这个。
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
const EXT_CONFIG = join(ROOT, "extension-chrome", "config.js");
const PORT = 8918;

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// 1) token
let token = "";
if (existsSync(TOKEN_FILE)) token = readFileSync(TOKEN_FILE, "utf8").trim();
if (!token) {
  token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  writeFileSync(TOKEN_FILE, token, "utf8");
  console.log("已生成 token:", TOKEN_FILE);
}

writeFileSync(
  EXT_CONFIG,
  `// 由 install-chrome.mjs 生成；Chrome 专用实例，端口 ${PORT}。\nexport const BRIDGE = {\n  port: ${PORT},\n  token: "${token}"\n};\n`,
  "utf8"
);
console.log("已写入:", EXT_CONFIG);

// 2) 注册 MCP
if (!existsSync(CONFIG)) {
  console.error("找不到 ZCode 配置:", CONFIG, "—— 请先运行一次 ZCode");
  process.exit(1);
}
const raw = readFileSync(CONFIG, "utf8");
const cfg = JSON.parse(raw);
cfg.mcp = cfg.mcp || {};
cfg.mcp.servers = cfg.mcp.servers || {};

if (!cfg.mcp.servers["browser-ext-chrome"]) {
  const backupDir = process.env.OFFICE_BACKUP_DIR || join(homedir(), "backups");
  let dir = backupDir;
  if (!existsSync(dir)) {
    try { mkdirSync(dir, { recursive: true }); } catch (e) { dir = dirname(CONFIG); console.log("WARN 备份目录不可用，回退:", dir); }
  }
  const bak = join(dir, `config.jsonbackup-${stamp()}.json`);
  writeFileSync(bak, raw, "utf8");
  console.log("已备份配置:", bak);
}

cfg.mcp.servers["browser-ext-chrome"] = {
  type: "stdio",
  command: process.execPath,
  args: [join(ROOT, "bridge", "server.mjs")],
  env: { ZCB_PORT: String(PORT) },
  timeoutMs: 60000
};
writeFileSync(CONFIG, JSON.stringify(cfg, null, 2), "utf8");
console.log("已注册 MCP server: browser-ext-chrome");

// 3) 开机自启
try {
  const startup = join(homedir(), "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
  if (existsSync(startup)) {
    const vbs = join(startup, "ZCode-Browser-Bridge-Chrome.vbs");
    const content = `' ZCode Browser Bridge - Chrome instance autostart\nCreateObject("WScript.Shell").Run """wscript.exe"" ""${join(ROOT, "bridge", "start-chrome-bridge.vbs")}""", 0, False\n`;
    writeFileSync(vbs, content, "utf8");
    console.log("已配置开机自启:", vbs);
  }
} catch (e) {
  console.log("WARN 开机自启配置失败:", e.message);
}

console.log("\n================ 下一步 ================");
console.log("1. 打开 Chrome，地址栏输入 chrome://extensions");
console.log("2. 打开右上角「开发者模式」");
console.log("3. 点「加载未打包的扩展程序」，选择目录:");
console.log("     " + join(ROOT, "extension-chrome"));
console.log("4. 点扩展图标，侧栏出现在右侧；顶部圆点变绿 = 已连上 8918");
console.log("5. 重启 ZCode 会话，会出现第二套 browser-ext-chrome 工具");
console.log("========================================");
