import { BRIDGE } from "./config.js";

const BASE = `http://127.0.0.1:${BRIDGE.port}`;
const TOKEN = BRIDGE.token || "";
const HEADERS = { "X-ZCBridge-Token": TOKEN, "Content-Type": "application/json" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROTECTED = /^(chrome|edge|about|devtools|chrome-extension|edge-extension):/i;
// 与 bridge/server.mjs 的 BRIDGE_PROTO 对齐；不一致时侧栏会显示警告
const PROTO = 2;

let loopStarted = false;
let loopGen = 0;

/* ---------------- 状态与日志（侧栏读取） ---------------- */

async function getState() {
  const got = await chrome.storage.session.get("zcb_state");
  return got.zcb_state || {};
}

async function setState(patch) {
  const next = { ...(await getState()), ...patch, updatedAt: Date.now() };
  await chrome.storage.session.set({ zcb_state: next });
  try {
    const p = chrome.runtime.sendMessage({ type: "zcb:state", state: next });
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (e) {}
  return next;
}

async function addLog(entry) {
  const got = await chrome.storage.session.get("zcb_log");
  const list = got.zcb_log || [];
  const item = { ts: Date.now(), ...entry };
  const next = [item, ...list].slice(0, 200);
  await chrome.storage.session.set({ zcb_log: next });
  try {
    const p = chrome.runtime.sendMessage({ type: "zcb:log", entry: item });
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (e) {}
}

/* ---------------- 页面内执行引擎（会被序列化注入页面，必须自包含） ---------------- */

function INPAGE(p) {
  "use strict";
  const act = p && p.act;
  const doc = document;

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) === 0) return false;
    return true;
  }

  function cssPath(el) {
    if (el.id) return "#" + CSS.escape(el.id);
    const parts = [];
    let cur = el;
    let depth = 0;
    while (cur && cur.nodeType === 1 && depth < 8) {
      if (cur.id) { parts.unshift("#" + CSS.escape(cur.id)); break; }
      const tag = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      if (!parent) { parts.unshift(tag); break; }
      const sameTag = Array.prototype.filter.call(parent.children, (c) => c.tagName === cur.tagName);
      if (sameTag.length === 1) {
        parts.unshift(tag);
      } else {
        const idx = Array.prototype.indexOf.call(parent.children, cur) + 1;
        parts.unshift(tag + ":nth-child(" + idx + ")");
      }
      cur = parent;
      depth++;
    }
    return parts.join(" > ");
  }

  function labelOf(el) {
    const aria = el.getAttribute("aria-label");
    if (aria) return aria.trim().slice(0, 100);
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea") {
      if (el.id) {
        try {
          const lab = doc.querySelector('label[for="' + CSS.escape(el.id) + '"]');
          if (lab && lab.innerText) return lab.innerText.trim().replace(/\s+/g, " ").slice(0, 100);
        } catch (e) {}
      }
      const wrap = el.closest("label");
      if (wrap && wrap.innerText) return wrap.innerText.trim().replace(/\s+/g, " ").slice(0, 100);
      const fallback = el.getAttribute("placeholder") || el.getAttribute("name") || el.type || tag;
      return String(fallback).slice(0, 100);
    }
    const t = (el.innerText || el.getAttribute("title") || "").replace(/\s+/g, " ").trim();
    return t.slice(0, 100);
  }

  function roleOf(el) {
    const r = el.getAttribute("role");
    if (r) return r;
    const tag = el.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "button") return "button";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
      const t = (el.type || "text").toLowerCase();
      if (t === "checkbox") return "checkbox";
      if (t === "radio") return "radio";
      if (t === "submit" || t === "button" || t === "reset") return "button";
      if (t === "search") return "searchbox";
      if (t === "password") return "password";
      return "textbox";
    }
    if (el.isContentEditable) return "textbox";
    return tag;
  }

  function isSensitive(el) {
    const t = (el.type || "").toLowerCase();
    if (t === "password") return true;
    const hint = ((el.name || "") + " " + (el.id || "") + " " + (el.getAttribute("autocomplete") || "") + " " + (el.getAttribute("placeholder") || "")).toLowerCase();
    return /password|passwd|pwd|card|credit|cvv|cvc|security code|身份证|密码|银行卡/.test(hint);
  }

  function valueOf(el) {
    if (!("value" in el) || el.value === undefined || el.value === null) return "";
    if (isSensitive(el)) return "••••";
    const v = String(el.value);
    return v.length > 80 ? v.slice(0, 80) + "…" : v;
  }

  function findEl(ref, path) {
    if (ref) {
      try {
        const byRef = doc.querySelector('[data-zcb-ref="' + CSS.escape(ref) + '"]');
        if (byRef) return byRef;
      } catch (e) {}
    }
    if (path) {
      try { const el = doc.querySelector(path); if (el) return el; } catch (e) {}
    }
    return null;
  }

  if (act === "snapshot") {
    const SEL = 'a[href],button,input,select,textarea,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="menuitem"],[role="combobox"],[role="option"],[onclick],[contenteditable="true"],[tabindex]:not([tabindex="-1"])';
    const nodes = Array.prototype.slice.call(doc.querySelectorAll(SEL));
    const max = p.max || 150;
    const elements = [];
    let seen = 0;
    for (let i = 0; i < nodes.length && elements.length < max; i++) {
      const el = nodes[i];
      seen++;
      if (!isVisible(el)) continue;
      const ref = "e" + (elements.length + 1);
      try { el.setAttribute("data-zcb-ref", ref); } catch (e) {}
      elements.push({
        ref,
        role: roleOf(el),
        name: labelOf(el),
        value: valueOf(el),
        path: cssPath(el),
        disabled: !!el.disabled,
        checked: el.type === "checkbox" || el.type === "radio" ? !!el.checked : undefined
      });
    }
    const main = doc.querySelector('main,[role="main"],article') || doc.body;
    let text = (main && main.innerText ? main.innerText : "").replace(/\n{3,}/g, "\n\n").trim();
    const textTruncated = text.length > 5000;
    if (textTruncated) text = text.slice(0, 5000) + "\n…[正文已截断]";
    return {
      ok: true,
      act: "snapshot",
      title: doc.title,
      url: location.href,
      viewport: { w: innerWidth, h: innerHeight },
      scroll: { y: Math.round(scrollY), total: Math.round(doc.documentElement.scrollHeight) },
      text,
      textTruncated,
      elements,
      elementCount: elements.length,
      hasMoreElements: nodes.length > seen
    };
  }

  if (act === "click") {
    const el = findEl(p.ref, p.path);
    if (!el) return { ok: false, act: "click", error: "元素未找到，页面可能已变化，请重新 snapshot" };
    el.scrollIntoView({ block: "center", inline: "center" });
    try { if (typeof el.focus === "function") el.focus(); } catch (e) {}
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return { ok: false, act: "click", error: "元素不可见" };
    if (el.disabled) return { ok: false, act: "click", error: "元素已禁用" };
    try {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const opts = { bubbles: true, cancelable: true, composed: true, clientX: cx, clientY: cy, view: window };
      el.dispatchEvent(new PointerEvent("pointerdown", opts));
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.dispatchEvent(new PointerEvent("pointerup", opts));
      el.dispatchEvent(new MouseEvent("mouseup", opts));
      el.dispatchEvent(new MouseEvent("click", opts));
    } catch (e) {
      try { el.click(); } catch (e2) {}
    }
    return { ok: true, act: "click", ref: p.ref, name: labelOf(el), url: location.href };
  }

  if (act === "type") {
    const el = findEl(p.ref, p.path);
    if (!el) return { ok: false, act: "type", error: "元素未找到，请重新 snapshot" };
    el.scrollIntoView({ block: "center" });
    try { el.focus(); } catch (e) {}
    const isField = el.tagName === "INPUT" || el.tagName === "TEXTAREA";
    if (!isField && !el.isContentEditable) return { ok: false, act: "type", error: "目标不可输入（tag=" + el.tagName + "）" };
    const text = String(p.text == null ? "" : p.text);
    if (el.isContentEditable) {
      if (p.clear !== false) el.textContent = "";
      el.textContent = (el.textContent || "") + text;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    } else {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      const next = p.clear === false ? (el.value || "") + text : text;
      if (desc && desc.set) desc.set.call(el, next);
      else el.value = next;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (p.submit) {
      const form = el.form || (el.closest ? el.closest("form") : null);
      if (form && typeof form.requestSubmit === "function") {
        try { form.requestSubmit(); } catch (e) {}
      } else {
        const k = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
        el.dispatchEvent(new KeyboardEvent("keydown", k));
        el.dispatchEvent(new KeyboardEvent("keypress", k));
        el.dispatchEvent(new KeyboardEvent("keyup", k));
      }
    }
    return { ok: true, act: "type", ref: p.ref, chars: text.length, submitted: !!p.submit };
  }

  if (act === "select") {
    const el = findEl(p.ref, p.path);
    if (!el || el.tagName !== "SELECT") return { ok: false, act: "select", error: "未找到 select 元素" };
    const target = String(p.value);
    let matched = false;
    for (let i = 0; i < el.options.length; i++) {
      const o = el.options[i];
      if (o.value === target || (o.text || "").trim() === target) { el.selectedIndex = i; matched = true; break; }
    }
    if (!matched) {
      return {
        ok: false,
        act: "select",
        error: "选项不存在",
        options: Array.prototype.map.call(el.options, (o) => ({ value: o.value, text: (o.text || "").trim() })).slice(0, 50)
      };
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, act: "select", value: el.value };
  }

  if (act === "press") {
    const el = doc.activeElement || doc.body;
    const parts = String(p.keys || "").split("+").map((s) => s.trim()).filter(Boolean);
    const key = parts.pop() || "Enter";
    const mods = { ctrlKey: parts.includes("Ctrl"), metaKey: parts.includes("Meta"), shiftKey: parts.includes("Shift"), altKey: parts.includes("Alt") };
    const code = key.length === 1 ? "Key" + key.toUpperCase() : key;
    const known = { Enter: 13, Escape: 27, Tab: 9, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Backspace: 8, Space: 32 };
    const kc = known[key] || key.toUpperCase().charCodeAt(0);
    const init = Object.assign({ key, code, keyCode: kc, which: kc, bubbles: true, cancelable: true }, mods);
    el.dispatchEvent(new KeyboardEvent("keydown", init));
    el.dispatchEvent(new KeyboardEvent("keypress", init));
    el.dispatchEvent(new KeyboardEvent("keyup", init));
    return { ok: true, act: "press", keys: p.keys, target: el.tagName };
  }

  if (act === "scroll") {
    const dir = p.direction || "down";
    const amount = Number(p.amount) || Math.round(innerHeight * 0.8);
    if (p.ref) {
      const el = findEl(p.ref, p.path);
      if (!el) return { ok: false, act: "scroll", error: "元素未找到" };
      el.scrollIntoView({ block: p.block || "center" });
    } else if (dir === "top") {
      scrollTo({ top: 0, behavior: "instant" });
    } else if (dir === "bottom") {
      scrollTo({ top: doc.documentElement.scrollHeight, behavior: "instant" });
    } else {
      scrollBy({ top: dir === "up" ? -amount : amount, behavior: "instant" });
    }
    return { ok: true, act: "scroll", y: Math.round(scrollY), total: Math.round(doc.documentElement.scrollHeight) };
  }

  if (act === "wait") {
    return new Promise(function (resolve) {
      const timeout = Number(p.timeoutMs) || 8000;
      const started = Date.now();
      const textNeedle = p.text ? String(p.text) : null;
      const selNeedle = p.selector ? String(p.selector) : null;
      if (!textNeedle && !selNeedle) {
        setTimeout(function () { resolve({ ok: true, act: "wait", waited: timeout }); }, Math.min(timeout, 5000));
        return;
      }
      (function tick() {
        let hit = false;
        if (selNeedle) { try { hit = !!doc.querySelector(selNeedle); } catch (e) {} }
        if (!hit && textNeedle) { hit = (doc.body.innerText || "").indexOf(textNeedle) !== -1; }
        if (hit) { resolve({ ok: true, act: "wait", found: true, waited: Date.now() - started }); return; }
        if (Date.now() - started >= timeout) { resolve({ ok: false, act: "wait", found: false, error: "等待超时", waited: Date.now() - started }); return; }
        setTimeout(tick, 250);
      })();
    });
  }

  if (act === "eval") {
    return (async function () {
      try {
        const fn = new Function("return (async () => (" + String(p.expression) + "))()");
        const value = await fn();
        let out;
        try { out = JSON.parse(JSON.stringify(value === undefined ? null : value)); } catch (e) { out = String(value); }
        return { ok: true, act: "eval", value: out };
      } catch (e) {
        const msg = String((e && e.message) || e);
        return {
          ok: false,
          act: "eval",
          error:
            /unsafe-eval|CSP|Content Security Policy/i.test(msg)
              ? "扩展的隔离世界禁止 eval（MV3 CSP），这条路径不可用。改用 browser_snapshot / browser_hooks 读取页面信息。"
              : msg
        };
      }
    })();
  }

  if (act === "hooks") {
    const out = { ok: true, act: "hooks", hasDialogs: false, hasConsole: false, dialogs: [], console: [] };
    try {
      const d = document.documentElement.getAttribute("data-zcb-dialogs");
      out.hasDialogs = d !== null;
      if (d) out.dialogs = JSON.parse(d);
    } catch (e) {}
    try {
      const c = document.documentElement.getAttribute("data-zcb-console");
      out.hasConsole = c !== null;
      if (c) out.console = JSON.parse(c);
    } catch (e) {}
    return out;
  }

  if (act === "info") {
    return { ok: true, act: "info", title: doc.title, url: location.href, readyState: doc.readyState, scrollY: Math.round(scrollY) };
  }

  return { ok: false, error: "未知页面动作: " + act };
}

/* ---------------- 页面主世界钩子：拦截原生弹窗 + 采集 console ---------------- */

// 必须注入到 MAIN world 才能改写页面的 window.confirm 等。
// 数据通过 DOM 属性回传给 isolated world（works 因为 DOM 跨 world 共享）。
function PAGE_HOOKS(opts) {
  const policy = (opts && opts.policy) || "accept";
  try {
    if (!window.__zcbHooked) {
      window.__zcbHooked = true;
      window.__zcbDialogs = window.__zcbDialogs || [];
      window.__zcbConsole = window.__zcbConsole || [];

      const sync = () => {
        try {
          document.documentElement.setAttribute("data-zcb-dialogs", JSON.stringify(window.__zcbDialogs.slice(-20)));
          document.documentElement.setAttribute("data-zcb-console", JSON.stringify(window.__zcbConsole.slice(-30)));
        } catch (e) {}
      };
      window.__zcbSync = sync;

      const pushDialog = (item) => {
        window.__zcbDialogs.push(item);
        if (window.__zcbDialogs.length > 50) window.__zcbDialogs.shift();
        sync();
      };

      window.alert = function (msg) {
        pushDialog({ type: "alert", message: String(msg == null ? "" : msg).slice(0, 300) });
      };
      window.confirm = function (msg) {
        pushDialog({ type: "confirm", message: String(msg == null ? "" : msg).slice(0, 300) });
        return window.__zcbPolicy !== "dismiss";
      };
      window.prompt = function (msg, def) {
        pushDialog({ type: "prompt", message: String(msg == null ? "" : msg).slice(0, 300) });
        if (window.__zcbPolicy === "dismiss") return null;
        return def == null ? "" : String(def);
      };

      const wrap = (level) => {
        const orig = console[level];
        console[level] = function (...args) {
          try {
            const text = args
              .map((a) => {
                try {
                  return typeof a === "string" ? a : JSON.stringify(a);
                } catch (e) {
                  return String(a);
                }
              })
              .join(" ")
              .slice(0, 300);
            window.__zcbConsole.push({ level, text });
            if (window.__zcbConsole.length > 100) window.__zcbConsole.shift();
            sync();
          } catch (e) {}
          try { return orig.apply(console, args); } catch (e) {}
        };
      };
      ["error", "warn"].forEach(wrap);
      sync();
    }
    window.__zcbPolicy = policy;
  } catch (e) {}
}

// isolated world 读取钩子收集到的数据
function READ_HOOKS() {
  const out = { dialogs: [], console: [] };
  try {
    const d = document.documentElement.getAttribute("data-zcb-dialogs");
    if (d) out.dialogs = JSON.parse(d);
  } catch (e) {}
  try {
    const c = document.documentElement.getAttribute("data-zcb-console");
    if (c) out.console = JSON.parse(c);
  } catch (e) {}
  return out;
}

/* ---------------- 标签页辅助 ---------------- */

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] || null;
}

async function listTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((t) => t.url && !PROTECTED.test(t.url))
    .map((t) => ({ id: t.id, windowId: t.windowId, title: t.title, url: t.url, active: !!t.active, status: t.status }));
}

async function openUrl(url, tabId) {
  if (!url) throw new Error("open 需要 url");
  if (tabId) {
    await chrome.tabs.update(tabId, { url, active: true });
    return { ok: true, tabId, url };
  }
  const tabs = await chrome.tabs.query({});
  const same = tabs.find((t) => t.url === url);
  if (same) {
    await chrome.tabs.update(same.id, { active: true });
    return { ok: true, tabId: same.id, url, reused: true };
  }
  const created = await chrome.tabs.create({ url, active: true });
  return { ok: true, tabId: created.id, url, reused: false };
}

async function screenshot(tabId) {
  let tab = tabId ? await chrome.tabs.get(tabId) : await activeTab();
  if (!tab) throw new Error("没有可用标签页");
  if (PROTECTED.test(tab.url || "")) throw new Error("受保护页面无法截图: " + tab.url);
  await chrome.tabs.update(tab.id, { active: true });
  await sleep(120);
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  return { ok: true, dataUrl, tabId: tab.id, url: tab.url, title: tab.title };
}

/* ---------------- 命令分发 ---------------- */

async function runCommand(cmd) {
  const act = cmd.act;
  const t0 = Date.now();

  if (act === "ping") return { ok: true, pong: t0 };
  if (act === "tabs") return { ok: true, tabs: await listTabs() };
  if (act === "open") return await openUrl(cmd.url, cmd.tabId);
  if (act === "screenshot") return await screenshot(cmd.tabId);
  if (act === "log") {
    await addLog({ dir: "zcb", act: "reply", ok: true, detail: String(cmd.text || "").slice(0, 300) });
    return { ok: true };
  }

  if (act === "page") {
    let tab = cmd.tabId ? await chrome.tabs.get(cmd.tabId) : await activeTab();
    if (!tab) throw new Error("没有可用的标签页");
    if (PROTECTED.test(tab.url || "")) throw new Error("受保护页面无法操作: " + tab.url);

    // 1) 先注入主世界钩子（拦截 alert/confirm/prompt、采集 console），幂等
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: PAGE_HOOKS,
        args: [{ policy: cmd.dialogPolicy || "accept" }]
      });
    } catch (e) {}

    // 2) 执行页面动作
    const frames = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: !!cmd.allFrames },
      func: INPAGE,
      args: [cmd.payload || {}]
    });
    const first = (frames || []).find((f) => f && f.result);
    if (!first) throw new Error("页面未返回结果");
    const r = first.result;

    // 3) 读回钩子收集到的弹窗/console
    let hooks = { dialogs: [], console: [] };
    try {
      const hr = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: READ_HOOKS });
      if (hr && hr[0] && hr[0].result) hooks = hr[0].result;
    } catch (e) {}

    return { ...r, dialogs: hooks.dialogs || [], console: hooks.console || [], tabId: tab.id, pageTitle: tab.title, pageUrl: tab.url };
  }

  throw new Error("未知命令: " + act);
}

async function postResult(id, result, elapsed) {
  const body = { id, result, elapsedMs: elapsed };
  await fetch(`${BASE}/result`, { method: "POST", headers: HEADERS, body: JSON.stringify(body) }).catch(() => {});
}

/* ---------------- 事件流：由 background 长轮询并推给侧栏 ---------------- */

let eventsStarted = false;
let lastEventSeq = 0;

async function eventsLoop() {
  try {
    const g = await chrome.storage.session.get("zcb_last_seq");
    if (g && typeof g.zcb_last_seq === "number") lastEventSeq = g.zcb_last_seq;
  } catch (e) {}

  while (true) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 30000);
      const res = await fetch(`${BASE}/events?since=${lastEventSeq}`, {
        headers: { "X-ZCBridge-Token": TOKEN },
        signal: ctl.signal,
        cache: "no-store"
      });
      clearTimeout(timer);

      if (!res.ok) {
        await sleep(1500);
        continue;
      }

      const data = await res.json();
      const list = data.events || [];
      for (const e of list) {
        lastEventSeq = Math.max(lastEventSeq, e.seq || 0);
        try {
          const p = chrome.runtime.sendMessage({ type: "zcb:event", event: e });
          if (p && typeof p.catch === "function") p.catch(() => {});
        } catch (err) {}
      }
      if (list.length) {
        try { chrome.storage.session.set({ zcb_last_seq: lastEventSeq }); } catch (e) {}
      } else {
        await sleep(300);
      }
    } catch (e) {
      await sleep(1500);
    }
  }
}

/* ---------------- 长轮询主循环 ---------------- */

async function startLoop() {
  if (loopStarted) return;
  loopStarted = true;
  const gen = ++loopGen;
  await setState({ connected: false, bridge: BASE, hasToken: !!TOKEN });

  if (!TOKEN) {
    await setState({ connected: false, error: "未配置 token，请运行 install.mjs" });
    loopStarted = false;
    return;
  }

  while (gen === loopGen) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 35000);
      const res = await fetch(`${BASE}/poll?proto=${PROTO}&ver=${encodeURIComponent(chrome.runtime.getManifest().version)}`, {
        headers: { "X-ZCBridge-Token": TOKEN },
        signal: ctl.signal,
        cache: "no-store"
      });
      clearTimeout(timer);

      if (res.status === 401) {
        await setState({ connected: false, error: "token 无效，请重跑 install.mjs" });
        await sleep(5000);
        continue;
      }
      if (!res.ok) {
        await setState({ connected: false, error: "bridge HTTP " + res.status });
        await sleep(2000);
        continue;
      }

      const cmd = await res.json();

      if (cmd && cmd.act === "__proto_mismatch") {
        await setState({
          connected: false,
          error: `协议版本不匹配（扩展 ${PROTO} / 桥期望 ${cmd.expected}），请到扩展页点「重新加载」`
        });
        await sleep(8000);
        continue;
      }

      await setState({ connected: true, error: null });
      if (cmd && cmd.act) {
        const t0 = Date.now();
        await addLog({ dir: "in", act: cmd.act, detail: cmd.act === "page" ? (cmd.payload && cmd.payload.act) : (cmd.url || "") });
        let result;
        try {
          result = await runCommand(cmd);
        } catch (e) {
          result = { ok: false, error: String((e && e.message) || e) };
        }
        await postResult(cmd.id, result, Date.now() - t0);
        await addLog({
          dir: "out",
          act: cmd.act,
          ok: result.ok !== false,
          detail: result.ok === false ? result.error : (result.act || "")
        });
      }
    } catch (e) {
      if (gen !== loopGen) break;
      await setState({ connected: false, error: "连不上本地桥（ZCode 未启动或端口被占用）" });
      await sleep(1500);
    }
  }
}

function restartLoop() {
  loopGen++;
  loopStarted = false;
  startLoop();
}

function startEvents() {
  if (eventsStarted) return;
  eventsStarted = true;
  eventsLoop();
}

/* ---------------- 生命周期 ---------------- */

// 已打开的页面不会因扩展重载自动注入新脚本，这里补一次
async function injectLauncher() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      if (!t.url || !/^https?:/i.test(t.url)) continue;
      try {
        await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ["content.js"] });
      } catch (e) {}
    }
  } catch (e) {}
}

chrome.runtime.onInstalled.addListener(async () => {
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); } catch (e) {}
  chrome.alarms.create("zcb-keepalive", { periodInMinutes: 1 });
  startLoop();
  startEvents();
  injectLauncher();
});

chrome.runtime.onStartup.addListener(() => {
  startLoop();
  startEvents();
  injectLauncher();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "zcb-keepalive") startLoop();
});

// service worker 每次被唤醒都会重新执行本文件
startLoop();
startEvents();

// 侧栏请求刷新连接
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "zcb:reconnect") {
    restartLoop();
    sendResponse({ ok: true });
    return true;
  }
  if (msg && msg.type === "zcb:openPanel") {
    const tab = sender && sender.tab;
    const done = (ok, detail) => {
      addLog({ dir: "zcb", act: "openPanel", ok, detail });
      sendResponse({ ok, detail });
    };

    const fallbackWindow = async () => {
      try {
        const win = await chrome.windows.getLastFocused().catch(() => null);
        const left = Math.max(0, ((win && win.left) || 0) + ((win && win.width) || 1400) - 410);
        const top = Math.max(0, ((win && win.top) || 0) + 70);
        await chrome.windows.create({
          url: chrome.runtime.getURL("sidepanel.html"),
          type: "popup",
          width: 390,
          height: Math.min(900, (msg.screenH || 1000) - 120),
          left,
          top
        });
        done(true, "已打开独立面板窗口");
      } catch (e) {
        done(false, "打开失败: " + String((e && e.message) || e));
      }
    };

    try {
      const p = chrome.sidePanel.open(tab ? { windowId: tab.windowId } : {});
      p
        .then(() => done(true, "侧栏已打开"))
        .catch((e) => {
          // Edge/Chrome 对手势来源校验较严时会走到这里，降级为独立小窗
          fallbackWindow();
        });
    } catch (e) {
      fallbackWindow();
    }
    return true;
  }
  if (msg && msg.type === "zcb:fetch") {
    const { path, method, body, timeout } = msg;
    fetch(`${BASE}${path}`, {
      method: method || "GET",
      headers: HEADERS,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout || 20000)
    })
      .then(async (r) => {
        const text = await r.text();
        let data = null;
        try { data = JSON.parse(text); } catch (e) { data = text; }
        sendResponse({ ok: r.ok, status: r.status, data });
      })
      .catch((e) => sendResponse({ ok: false, status: 0, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg && msg.type === "zcb:getState") {
    getState().then((s) => sendResponse(s));
    return true;
  }
  return false;
});
