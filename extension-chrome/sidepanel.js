import { BRIDGE } from "./config.js";

const BASE = `http://127.0.0.1:${BRIDGE.port}`;
const TOKEN = BRIDGE.token || "";

const $ = (id) => document.getElementById(id);
const dot = $("dot");
const pageBar = $("pageBar");
const stream = $("stream");
const inputEl = $("input");
const sendBtn = $("send");
const working = $("working");
const lockBtn = $("lock");
const toggleToolsBtn = $("toggleTools");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastSeq = 0;
let pendingTool = null;
let connected = null; // null = 未知，避免首次 false 被 early-return 吞掉
let lastLocalUser = { text: "", ts: 0 };
let locked = false;
let protoMismatch = false;
let hideTools = false;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 所有网络请求走 background 代理，规避扩展页面的跨域/PNA 限制
function rpc(path, opts = {}) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: "zcb:fetch", path, method: opts.method, body: opts.body, timeout: opts.timeout },
        (r) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message || "消息通道关闭" });
            return;
          }
          resolve(r || { ok: false, error: "没有响应" });
        }
      );
    } catch (e) {
      resolve({ ok: false, error: String((e && e.message) || e) });
    }
  });
}

function setStatus(text, ok) {
  connected = ok;
  dot.classList.toggle("on", !!ok);
  if (protoMismatch) return; // 版本不匹配的警告优先显示
  pageBar.textContent = text;
  pageBar.style.color = "";
}

function renderLock() {
  lockBtn.textContent = locked ? "已锁定" : "锁定";
  lockBtn.classList.toggle("locked", locked);
}

function applyToolsVisibility() {
  document.body.classList.toggle("hide-tools", hideTools);
  toggleToolsBtn.classList.toggle("active", hideTools);
  toggleToolsBtn.textContent = hideTools ? "过程" : "过程";
  toggleToolsBtn.title = hideTools ? "当前隐藏工具调用过程，点击显示" : "当前显示工具调用过程，点击隐藏";
}

async function pollHealth() {
  while (true) {
    const h = await rpc("/health", { timeout: 5000 });
    if (h.ok && h.data) {
      const d = h.data;
      if (typeof d.locked === "boolean" && d.locked !== locked) {
        locked = d.locked;
        renderLock();
      }
      const mismatch = d.protocol && d.protocol.match === false;
      if (mismatch && !protoMismatch) {
        protoMismatch = true;
        pageBar.textContent = `⚠ 协议版本不匹配：扩展 ${d.protocol.extension} / 桥 ${d.protocol.bridge} — 请到 edge://extensions 点「重新加载」`;
        pageBar.style.color = "var(--bad)";
      } else if (!mismatch && protoMismatch) {
        protoMismatch = false;
        pageBar.style.color = "";
        setStatus("已连接本地桥", true);
      }
    }
    await sleep(5000);
  }
}

function scrollDown() {
  stream.scrollTop = stream.scrollHeight;
}

function atBottom() {
  return stream.scrollHeight - stream.scrollTop - stream.clientHeight < 80;
}

function addSys(text) {
  const div = document.createElement("div");
  div.className = "sys";
  div.textContent = text;
  stream.appendChild(div);
  scrollDown();
}

function addUser(text) {
  const row = document.createElement("div");
  row.className = "row user";
  row.innerHTML = `<div class="bubble">${esc(text)}</div>`;
  stream.appendChild(row);
  scrollDown();
}

function addReply(text) {
  const row = document.createElement("div");
  row.className = "row reply";
  row.innerHTML = `<div class="avatar">Z</div><div class="bubble">${esc(text)}</div>`;
  stream.appendChild(row);
  scrollDown();
}

function addTool(e) {
  const stick = atBottom();
  const row = document.createElement("div");
  row.className = "row tool-row";
  row.innerHTML = `
    <div class="avatar">Z</div>
    <div class="tool-card running">
      <div class="tool-head">
        <span class="spinner"></span>
        <span class="tool-name">${esc(e.name || "")}</span>
        <span class="tool-ms"></span>
      </div>
      <div class="tool-detail">${esc(e.detail || "")}</div>
    </div>`;
  stream.appendChild(row);
  pendingTool = row;
  working.style.display = "flex";
  if (stick) scrollDown();
}

function addResult(e) {
  if (!pendingTool) return;
  const card = pendingTool.querySelector(".tool-card");
  card.classList.remove("running");
  const spin = card.querySelector(".spinner");
  if (spin) {
    const mark = document.createElement("span");
    mark.className = e.ok ? "tick" : "cross";
    mark.textContent = e.ok ? "✓" : "✕";
    spin.replaceWith(mark);
  }
  card.querySelector(".tool-ms").textContent = (e.ms || 0) + " ms";
  if (e.detail) {
    const d = card.querySelector(".tool-detail");
    d.textContent = e.detail;
    d.style.color = e.ok ? "" : "var(--bad)";
  }
  pendingTool = null;
  working.style.display = "none";
  scrollDown();
}

function render(e) {
  if (!e) return;
  if (e.type === "user") {
    if (e.text === lastLocalUser.text && Date.now() - lastLocalUser.ts < 3000) return;
    addUser(e.text);
    return;
  }
  if (e.type === "tool") return addTool(e);
  if (e.type === "result") return addResult(e);
  if (e.type === "reply") return addReply(e.text);
  if (e.type === "status") {
    addSys(e.detail || "处理中…");
    return;
  }
}

/* ---------------- 事件与状态 ---------------- */

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === "zcb:event" && msg.event) {
    lastSeq = Math.max(lastSeq, msg.event.seq || 0);
    render(msg.event);
  }
  if (msg.type === "zcb:state") {
    const s = msg.state || {};
    if (s.connected) setStatus("已连接本地桥", true);
    else setStatus(s.error || "未连接本地桥", false);
  }
});

async function pollPage() {
  while (true) {
    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const t = tabs[0];
      if (connected && !protoMismatch) pageBar.textContent = t ? (t.title || t.url || "") : "没有活动页面";
    } catch (e) {}
    await sleep(2000);
  }
}

/* ---------------- 发送 ---------------- */

async function send() {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = "";
  autoGrow();

  addUser(text);
  lastLocalUser = { text, ts: Date.now() };

  const res = await rpc("/inbox", { method: "POST", body: { text }, timeout: 10000 });
  if (!res.ok) {
    addSys("发送失败：" + (res.error || "HTTP " + res.status));
    return;
  }
  if (res.data && res.data.autoRun) {
    addSys("已交给 ZCode 执行，过程会实时显示在这里");
  } else {
    addSys("已排队 · 自动执行已关闭");
  }
}

function autoGrow() {
  inputEl.style.height = "20px";
  inputEl.style.height = Math.min(120, inputEl.scrollHeight) + "px";
}

inputEl.addEventListener("input", autoGrow);
inputEl.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.isComposing || e.keyCode === 229) return;
  if (e.shiftKey) return;
  e.preventDefault();
  send();
});

sendBtn.addEventListener("click", send);

$("clear").addEventListener("click", () => {
  stream.innerHTML = "";
  pendingTool = null;
  working.style.display = "none";
  addSys("对话已清空");
});

lockBtn.addEventListener("click", async () => {
  const next = !locked;
  const res = await rpc("/lock", { method: "POST", body: { locked: next }, timeout: 6000 });
  if (res.ok) {
    locked = !!(res.data && res.data.locked);
    renderLock();
    addSys(locked ? "🔒 已锁定：模型的浏览器操作被冻结（连接保持）" : "🔓 已解锁：允许操作");
  } else {
    addSys("切换锁定失败：" + (res.error || "HTTP " + res.status));
  }
});

toggleToolsBtn.addEventListener("click", () => {
  hideTools = !hideTools;
  applyToolsVisibility();
  try { chrome.storage.local.set({ zcb_hide_tools: hideTools }); } catch (e) {}
  addSys(hideTools ? "已隐藏工具调用过程（只显示对话）" : "已显示工具调用过程");
});

window.addEventListener("error", (e) => {
  pageBar.textContent = "脚本错误：" + (e.message || "未知");
});
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason;
  pageBar.textContent = "异步错误：" + ((r && r.message) || String(r));
});

/* ---------------- 启动 ---------------- */

(async () => {
  // 读 background 缓存的状态（background 一直在轮询，状态最准）
  try {
    const got = await chrome.storage.session.get("zcb_state");
    const s = (got && got.zcb_state) || {};
    if (s.connected) setStatus("已连接本地桥", true);
    else setStatus(s.error || "正在等待 background 连接…", false);
  } catch (e) {
    setStatus("正在等待 background 连接…", null);
  }

  // 拉历史（走 background 代理）
  const hist = await rpc("/events?since=0", { timeout: 8000 });
  if (hist.ok && hist.data && hist.data.events) {
    for (const e of hist.data.events.slice(-80)) {
      lastSeq = Math.max(lastSeq, e.seq || 0);
      render(e);
    }
    if (connected !== true) setStatus("已连接本地桥", true);
  }

  if (!stream.childElementCount) addSys("侧栏已就绪，等 ZCode 干活时会实时显示在这里");

  // 初始化锁定状态与协议版本
  const hh = await rpc("/health", { timeout: 5000 });
  if (hh.ok && hh.data) {
    locked = !!hh.data.locked;
    if (hh.data.protocol && hh.data.protocol.match === false) {
      protoMismatch = true;
      pageBar.textContent = `⚠ 协议版本不匹配：扩展 ${hh.data.protocol.extension} / 桥 ${hh.data.protocol.bridge}`;
      pageBar.style.color = "var(--bad)";
    }
  }
  renderLock();

  // 恢复"隐藏过程"偏好
  try {
    const g = await chrome.storage.local.get("zcb_hide_tools");
    hideTools = !!(g && g.zcb_hide_tools);
  } catch (e) {}
  applyToolsVisibility();

  pollHealth();
  pollPage();
})();
