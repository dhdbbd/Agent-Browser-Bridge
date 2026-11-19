// 页面右侧悬浮按钮：点击打开 ZCode 侧栏，可上下拖动调整位置
(() => {
  const VER = "v2";
  if (window.__zcbLauncherVer === VER) return;
  window.__zcbLauncherVer = VER;

  // 清掉旧版本注入的按钮，保证升级后直接替换
  document.querySelectorAll("[data-zcb-launcher]").forEach((el) => {
    try { el.remove(); } catch (e) {}
  });

  const host = document.createElement("div");
  host.setAttribute("data-zcb-launcher", "1");
  host.style.cssText =
    "position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:2147483647;pointer-events:none;";

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .wrap {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 6px;
        height: 46px;
        padding: 0 9px 0 11px;
        background: #ffffff;
        color: #1f2328;
        border: 1px solid #e3e6ea;
        border-right: none;
        border-radius: 10px 0 0 10px;
        box-shadow: 0 2px 10px rgba(15, 23, 42, 0.12);
        cursor: grab;
        font: 600 13px/1 "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
        user-select: none;
        touch-action: none;
        opacity: 0.62;
        transition: opacity .15s ease, transform .15s ease;
      }
      .wrap:hover { opacity: 1; transform: translateX(-3px); }
      .wrap.dragging { cursor: grabbing; opacity: 1; transition: none; }
      .wrap.ping { transform: translateX(-5px) scale(0.96); }
      .mark {
        width: 22px; height: 22px; border-radius: 6px;
        background: #1f2937; color: #fff;
        display: flex; align-items: center; justify-content: center;
        font: 700 13px/1 "Segoe UI", system-ui, sans-serif;
      }
      .dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: #9ca3af; transition: background .2s ease;
      }
      .dot.on { background: #16a34a; }
      .label { display: none; }
      .wrap:hover .label { display: inline; }
      @media (prefers-color-scheme: dark) {
        .wrap { background: #262a2f; color: #e6e8ea; border-color: #3a4048; }
        .mark { background: #e6e8ea; color: #1b1d21; }
      }
    </style>
    <div class="wrap" role="button" tabindex="0" title="点击打开 ZCode 侧栏 · 可上下拖动">
      <span class="mark">Z</span>
      <span class="dot" id="dot"></span>
      <span class="label">ZCode</span>
    </div>
  `;

  const wrap = shadow.querySelector(".wrap");
  const dot = shadow.querySelector("#dot");

  function applyTop(px) {
    const max = Math.max(6, window.innerHeight - 62);
    const clamped = Math.max(6, Math.min(max, px));
    host.style.top = clamped + "px";
    host.style.transform = "none";
    return clamped;
  }

  // 恢复上次拖动的位置
  try {
    chrome.storage.local.get("zcb_launcher_top").then((g) => {
      if (g && typeof g.zcb_launcher_top === "number") applyTop(g.zcb_launcher_top);
    });
  } catch (e) {}

  function openPanel() {
    try {
      chrome.runtime.sendMessage(
        {
          type: "zcb:openPanel",
          screenW: (window.screen && window.screen.availWidth) || 1920,
          screenH: (window.screen && window.screen.availHeight) || 1000
        },
        () => {
          if (chrome.runtime.lastError) return;
          wrap.classList.add("ping");
          setTimeout(() => wrap.classList.remove("ping"), 600);
        }
      );
    } catch (e) {}
  }

  let drag = null;

  wrap.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    drag = { startY: e.clientY, originTop: host.getBoundingClientRect().top, moved: false };
    wrap.classList.add("dragging");
    try { wrap.setPointerCapture(e.pointerId); } catch (err) {}
  });

  wrap.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dy) > 3) drag.moved = true;
    if (drag.moved) applyTop(drag.originTop + dy);
  });

  wrap.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    wrap.classList.remove("dragging");
    try { wrap.releasePointerCapture(e.pointerId); } catch (err) {}
    if (moved) {
      try { chrome.storage.local.set({ zcb_launcher_top: parseFloat(host.style.top) }); } catch (err) {}
    } else {
      openPanel();
    }
  });

  wrap.addEventListener("pointercancel", () => {
    drag = null;
    wrap.classList.remove("dragging");
  });

  wrap.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPanel();
    }
  });

  window.addEventListener("resize", () => {
    const cur = parseFloat(host.style.top);
    if (!Number.isNaN(cur)) applyTop(cur);
  });

  // 桥连接状态
  try {
    chrome.storage.session.get("zcb_state").then((got) => {
      if (got && got.zcb_state && got.zcb_state.connected) dot.classList.add("on");
    }).catch(() => {});
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "session" && changes.zcb_state) {
        dot.classList.toggle("on", !!(changes.zcb_state.newValue || {}).connected);
      }
    });
  } catch (e) {}

  function mount() {
    if (!document.documentElement.contains(host)) document.documentElement.appendChild(host);
  }
  mount();
  // 某些单页应用会重绘根节点，兜底重新挂载
  setInterval(mount, 5000);
})();
