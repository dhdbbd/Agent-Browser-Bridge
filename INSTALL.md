# 安装指南

**小白直接用：把整个文档复制，粘贴给你的 AI（ZCode / Claude / Cursor 等），说「帮我按这个文档安装」。** AI 会自动完成命令行部分，需要你手动点的地方它会一步步教你。下面是给 AI 和想自己动手的人看的。

全程不需要管理员权限。

---

## 你需要准备

| 东西 | 说明 |
|---|---|
| 一个浏览器 | Edge 或 Chrome，114 以上 |
| Node.js | 没装的话先装，见第二步 |
| 这个项目的文件夹 | 下载解压到固定位置，别放临时目录 |

> **给 AI 的执行提示**：这个安装脚本会把 MCP server 注册到 `~/.zcode/cli/config.json`（参考实现所属 Agent 的配置）。如果你服务的 Agent 不是 ZCode，**跳过运行 `install.mjs`，改为直接在宿主 Agent 的 MCP 配置里注册** `bridge/server.mjs`（stdio，env `ZCB_PORT=8917`），其余步骤相同。每完成一步向用户确认一次。

---

## 第一步：解压

把压缩包解压到一个固定的地方，比如：

```
D:\Tools\agent-browser-bridge
```

> 不要放在「下载」或「临时」目录，删了就没了，扩展会失效。

---

## 第二步：装 Node.js（已装可跳过）

1. 打开 <https://nodejs.org>
2. 下载 **LTS** 版本
3. 一路「下一步」装完

验证：打开命令行输入 `node -v`，能看到版本号就对了。

> 如果电脑没有外网，用别人机器下好安装包拷过来。

---

## 第三步：加载扩展

### Edge

1. 地址栏输入 `edge://extensions`
2. 打开右上角「开发人员模式」
3. 点「加载解压缩的扩展」
4. 选择 `extension` 文件夹

### Chrome

1. 地址栏输入 `chrome://extensions`
2. 打开右上角「开发者模式」
3. 点「加载未打包的扩展程序」
4. 选择 `extension` 文件夹

> Chrome 137 以后只能这样手动加载一次，装完会记住，重启不用重装。
> （浏览器安全限制，这一步必须手动点，AI 替不了。）

**如果你两个浏览器都要用**，Chrome 那边选 `extension-chrome` 文件夹（不是 `extension`）。

---

## 第四步：注册到你的 Agent

**方式 A：标准 MCP 配置（通用，推荐）**

在你的 Agent 客户端 MCP 配置里加：

```json
{
  "mcpServers": {
    "agent-browser-bridge": {
      "command": "node",
      "args": ["<项目路径>/bridge/server.mjs"],
      "env": { "ZCB_PORT": "8917" }
    }
  }
}
```

**方式 B：运行安装脚本（参考实现专用）**

如果宿主 Agent 就是 ZCode，在 `browser-ext` 目录打开命令行（地址栏输入 `cmd` 回车也行），执行：

```cmd
node install.mjs
```

看到类似输出就成功了：

```
已写入扩展配置: ...\extension\config.js
已备份配置: ...
已注册 MCP server: browser-ext
```

**Chrome 也要用的话**，再执行 `node install-chrome.mjs`（或手动注册第二个 MCP server，端口 8918）。

---

## 第五步：重启 + 验证

1. 关掉浏览器，重新打开
2. 重启你的 Agent（或新开一个会话），让 `browser_*` 工具加载

验证方法：

- 随便打开一个网页，右侧边缘会出现一个悬浮按钮（可以按住上下拖）
- 点它，右侧弹出面板
- 面板顶部圆点变**绿色** = 连上了
- 对 AI 说「检查浏览器连接」，它会报告已连接

---

## 怎么用

在浏览器右侧面板里直接说人话：

```
看一下我有几个待办
把这个页面的公司名称填成浙江亚特
点开第一条待办
```

AI 会一步步操作，每一步都显示在面板里。

---

## 常见问题

**面板一直显示「正在连接」**

说明桥接服务没起来。检查：
- Agent 是否在运行（会话内模式靠 Agent 拉起桥），或手动跑常驻模式：`node bridge\server.mjs --serve-only`
- 命令行执行上面的命令看有没有报错

**Agent 里看不到浏览器工具**

- 重启 Agent（工具列表是启动时加载的）
- 检查 MCP 配置里有没有注册这个桥（ZCode 参考：`C:\Users\<你的用户名>\.zcode\cli\config.json` 里有没有 `browser-ext`）

**端口冲突**

如果提示 8917 被占用，说明已经有一个实例在跑，不用重复启动。

**Chrome 加载时提示「清单文件丢失」**

说明选错了文件夹——要选 `extension`（里面直接有 `manifest.json`），不是项目根目录。

---

## 安全说明

- 桥接服务只监听本机 `127.0.0.1`，外部网络连不进来
- 每次安装会生成独立的 token，不同电脑之间不共用
- 密码框、卡号在快照里自动显示成 `••••`
- 侧栏顶部有「锁定」按钮，点了 AI 立刻无法操作浏览器

---

## 卸载

1. 浏览器扩展页 → 移除扩展
2. 删掉（如果配置过）开机自启的 `.vbs`
3. 从 Agent 的 MCP 配置里删掉对应条目（ZCode：`config.json` 里的 `browser-ext` / `browser-ext-chrome`）
4. 删除项目文件夹
