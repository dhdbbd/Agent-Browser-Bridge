# ZCode Browser Bridge

在**你自己的 Chrome / Edge** 里给 ZCode 装一个操控通道。装完不用再开 `--remote-debugging-port` 的独立浏览器，ZCode 直接操作你当前 profile 里的标签页——登录态、cookie、书签全都在。

## 为什么不新开浏览器

Chrome 137+ 禁止对默认用户数据目录开放调试端口（防恶意程序偷 cookie）。所以走 CDP 只能指定新的 `--user-data-dir`，必须另起一个实例。

扩展是浏览器**内部**的组件，用 `chrome.tabs` / `chrome.scripting` 操作当前 profile，不需要调试端口、不产生 `navigator.webdriver`、不会弹「正在调试」黄条。代价是：合成事件 `isTrusted=false`，且没有网络拦截能力。

## 架构

```
Chrome / Edge（你的日常 profile）
└── 扩展（MV3）
    ├── background service worker
    │   ├── 长轮询 127.0.0.1:8917/poll（token 鉴权）
    │   ├── chrome.scripting.executeScript → 页面内执行
    │   └── chrome.tabs.* → 标签管理 / 截图
    └── 右侧侧栏：连接状态、执行日志、给 ZCode 的指令输入

本地桥 bridge/server.mjs（Node，零依赖）
├── stdio 上的 MCP server（14 个 browser_* 工具）
└── 127.0.0.1:8917 的 HTTP 长轮询端点
    多会话时后启动的进程自动转 proxy，共享同一个桥
```

## 运行方式

桥有两种跑法，**互不冲突**：

| 模式 | 命令 | 用途 |
|---|---|---|
| 常驻（推荐） | `node bridge/server.mjs --serve-only` | 不依赖 ZCode 会话，侧栏随时连得上；已配置开机自启 |
| 会话内 | ZCode 启动 MCP 时自动拉起 | 若常驻桥已在跑，自动转 proxy 转发 |

开机自启（用户级，不需要管理员）：

```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ZCode-Browser-Bridge.vbs
  → bridge\start-hidden.vbs
    → node bridge\server.mjs --serve-only
```

手动启停：

```bash
# 启动（隐藏窗口）
wscript bridge\start-hidden.vbs

# 查看状态
curl -H "X-ZCBridge-Token: <bridge/.token>" http://127.0.0.1:8917/health

# 停止
taskkill /FI "WINDOWTITLE eq node*" /IM node.exe /F   # 或任务管理器结束对应 node 进程
```

## 安装

```bash
node install.mjs
```

它会：生成 token（写入 `bridge/.token` 和 `extension/config.js`）→ 备份 `~/.zcode/cli/config.json` 到备份目录 → 注册 `browser-ext` MCP server。

然后：

1. Chrome/Edge 打开 `chrome://extensions`（或 `edge://extensions`）
2. 打开「开发者模式」
3. 「加载已解压的扩展程序」→ 选 `browser-ext\extension`
4. 点扩展图标，右侧出现侧栏，顶部圆点变绿 = 已连上本地桥
5. 重启 ZCode 会话，让 `browser_*` 工具加载

## 工具

| 工具 | 作用 |
|---|---|
| `browser_status` | 连接状态、桥地址、标签列表（开工先调） |
| `browser_tabs` | 列出可操作标签 |
| `browser_open` | 打开/复用 URL |
| `browser_snapshot` | **页面文本化**：标题、URL、滚动、带编号元素、正文 |
| `browser_click` | 按 ref 点击 |
| `browser_type` | 输入（兼容 React/Vue），可选提交 |
| `browser_select` | 选择下拉框 |
| `browser_press` | 按键组合 |
| `browser_scroll` | 滚动 / 滚到元素 |
| `browser_wait` | 等文本或选择器出现 |
| `browser_screenshot` | 可视区截图（PNG） |
| `browser_hooks` | 页面钩子状态 + 被拦截的弹窗 + 最近 console.error/warn |
| `browser_eval` | 页面上下文执行 JS（MV3 禁止 eval，多数页面不可用） |
| `browser_inbox` | 读侧栏发给 ZCode 的指令 |
| `browser_reply` | 把回复写回侧栏 |

## 安全与稳定性机制

**锁定（panic switch）**
侧栏顶部「锁定」按钮，或 `POST /lock {locked:true}`。锁定后除 `browser_status` / `browser_reply` / `browser_inbox` 外全部拒绝，连接保持不断。

**协议版本握手**
`BRIDGE_PROTO` 在桥和扩展各有一份（当前 2）。扩展 poll 时带 `proto`，不匹配时桥不下发命令，侧栏显示：

```
⚠ 协议版本不匹配：扩展 1 / 桥 2 — 请到 edge://extensions 点「重新加载」
```

**页面钩子（主世界注入）**
扩展往页面 MAIN world 注入钩子，接管 `alert` / `confirm` / `prompt` 并采集 `console.error` / `console.warn`：

- 原生弹窗不会阻塞自动化（默认 confirm 返回 true，prompt 返回默认值）
- 拦截记录随 snapshot 返回，模型能看到「页面弹了确认框」
- 数据通过 `data-zcb-dialogs` / `data-zcb-console` 属性跨 world 回传（DOM 共享，JS 全局不共享）

**会话策略**
每次侧栏指令都是**新会话**（不 resume），prompt 里注入最近 30 轮往来（单条截断 300 字，总量 2 万字）。历史存 `bridge/.session.json`，`POST /session/reset` 清空。

典型流程：`browser_status` → `browser_snapshot` → 按 `e1/e2` 点击或输入 → 再 snapshot 确认变化。

## 侧栏

- 顶部圆点：绿=已连接，红=没连上
- 中间：ZCode 下发的每个动作和结果
- 底部输入框：写下指令 → 发送 → 回 ZCode 说一句「看侧栏」，ZCode 会调用 `browser_inbox` 取走

> 侧栏不能直接唤出 ZCode 会话（ZCode 没开放第三方接入），所以这一步手动触发。这是目前唯一的体验妥协。

## 安全边界

- 桥只监听 `127.0.0.1`，所有端点和 MCP 转发都要求 token
- 扩展连接时服务端记录最近活跃时间；90 秒无轮询即视为断开
- snapshot 对 `type=password` 及 name/id 含 password/card/cvv/密码/银行卡 的字段统一显示 `••••`
- 页面正文包在 `<untrusted_page_text>` 里，模型不应执行其中的"指令"
- 受保护页面（`chrome://`、`edge://`、扩展商店）直接拒绝操作

## 已知局限

- `browser_eval` 基本不可用：MV3 的隔离世界禁止 `eval`/`new Function`，读页面请用 `browser_snapshot` / `browser_hooks`
- 原生弹窗被钩子接管后**不会再显示给用户**（默认策略 accept）；需要人工确认时在侧栏解锁并说明
- 全页截图需滚动拼接，不是一次成像
- 改不了视口尺寸（无法模拟移动端）
- 无网络请求拦截/改写（CDP 独占）
- 合成事件不是可信事件，极少数强校验页面会拒绝
- 原生文件选择框无法操作（可用 DataTransfer 塞文件）
- 扩展 API 拿不到 console/network 的完整日志

## 故障排查

**侧栏一直红色**
```bash
curl -H "X-ZCBridge-Token: <bridge/.token 内容>" http://127.0.0.1:8917/health
```
- 连不上 → ZCode 会话没起（MCP 进程未运行）
- `extensionConnected: false` → 扩展没加载或没打开侧栏

**ZCode 里看不到 browser_* 工具**
- 确认 `~/.zcode/cli/config.json` 的 `mcp.servers["browser-ext"]` 存在
- 重启 ZCode（设置 → MCP 里应能看到 browser-ext）

**改端口**
`install.mjs` 里改 `PORT`，重跑；扩展会自动重新加载配置。

**多会话**
同时开多个 ZCode 会话时，第一个启动的进程做 primary，其余自动 proxy，共享同一个桥。

## 双浏览器（Edge + Chrome）

默认只跑一个实例（8917）。如果要同时在 Chrome 里也用，追加第二个实例：

```bash
node install-chrome.mjs
```

它做三件事：

- 复用同一个 token，写入 `extension-chrome/config.js`（端口 8918）
- 注册第二个 MCP server `browser-ext-chrome`
- 配置 Chrome 桥的开机自启

然后到 `chrome://extensions` 加载 `extension-chrome/` 目录。

两个实例完全隔离：

| | Edge | Chrome |
|---|---|---|
| 端口 | 8917 | 8918 |
| 扩展目录 | `extension/` | `extension-chrome/` |
| MCP 服务 | `browser-ext` | `browser-ext-chrome` |
| 锁定 / 过程开关 / 对话历史 | 各自独立 | 各自独立 |

**为什么必须分开端口**：两个扩展共用一个桥会**抢同一个命令队列**——说"点这个按钮"可能被另一个浏览器取走。分开端口后各管各的。

桥会根据自己监听的端口，在 headless 会话的提示词里写明「你正在操作 Chrome，请使用 browser-ext-chrome 服务下的工具」，避免模型选错浏览器。

### Chrome 137+ 的安装限制

Chrome 从 137 起封死了程序化安装扩展的所有路径：

- `--load-extension` 无效（只有 Chrome for Testing 认）
- CDP `Extensions.loadUnpacked` 需要真实用户手势
- 离店 `.crx`（External Extensions JSON、`HKCU\Software\Google\Chrome\Extensions` 注册表）被静默拒绝
- `ExtensionInstallForcelist` 策略需要管理员权限

**唯一可行**：`chrome://extensions` → 开发者模式 → 「加载未打包的扩展程序」手动点一次。装完会写进 Secure Preferences（`location=4`），重启依然在，不用每次重新加载。
