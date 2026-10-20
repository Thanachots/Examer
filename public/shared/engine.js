// engine.js — ตัวเรียกโมเดลในเบราว์เซอร์ (ทำงานใน engine-worker.js)
// ใช้: await BrowserEngine.load(onStatus) แล้ว await BrowserEngine.grade(file) → Result ตาม docs/ENGINE.md

// ที่อยู่ของไฟล์นี้ (shared/engine.js) — ใช้หา engine-worker.js และโฟลเดอร์ engine/ ได้ไม่ว่าหน้าไหนจะเรียก
const ENGINE_BASE = document.currentScript?.src || location.href;

const ENGINE_DEFAULTS = {
  pyodide: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
  ort: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/",
  // โค้ด Python ของ repo โมเดล — ปักไว้ที่ commit ที่ทดสอบแล้ว (เปลี่ยนเมื่อทีมโมเดลอัปเดต)
  cvSrc: "https://cdn.jsdelivr.net/gh/67160328/Computer-Vision@7fe575a/",
  engine: "../engine/", // public/engine/ (นับจาก shared/)
};

const BrowserEngine = (() => {
  let worker = null, loading = null, seq = 0;
  const waiting = new Map();
  const listeners = new Set();
  const state = { status: "idle", text: "ยังไม่ได้โหลด", p: 0, error: null };

  // ใช้ทดสอบ / ใช้แบบออฟไลน์: localStorage "examer.engineConfig" = {"pyodide": "...", ...}
  function config() {
    let o = {};
    try { o = JSON.parse(localStorage.getItem("examer.engineConfig")) || {}; } catch {}
    const c = { ...ENGINE_DEFAULTS, ...o };
    for (const k of Object.keys(c)) c[k] = new URL(c[k], ENGINE_BASE).href;
    return c;
  }

  function emit(patch) {
    Object.assign(state, patch);
    listeners.forEach((fn) => fn({ ...state }));
  }

  function call(type, payload, transfer) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      worker.postMessage({ id, type, payload }, transfer || []);
    });
  }

  function start() {
    worker = new Worker(new URL("engine-worker.js", ENGINE_BASE));
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "status") return emit({ text: m.text, p: m.p });
      const w = waiting.get(m.id);
      if (!w) return;
      waiting.delete(m.id);
      m.ok ? w.resolve(m.result) : w.reject(new Error(m.error));
    };
    worker.onerror = (e) => emit({ status: "error", error: e.message || "worker error", text: "โหลดไม่สำเร็จ" });
  }

  return {
    state: () => ({ ...state }),
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    isReady: () => state.status === "ready",

    load() {
      if (loading) return loading;
      if (!worker) start();
      emit({ status: "loading", error: null });
      loading = call("init", config())
        .then(() => emit({ status: "ready", text: "พร้อม", p: 1 }))
        .catch((err) => {
          loading = null;
          emit({ status: "error", error: err.message, text: "โหลดไม่สำเร็จ" });
          throw err;
        });
      return loading;
    },

    async grade(file) {
      await this.load();
      const buf = await file.arrayBuffer();
      return call("grade", { buf, name: file.name || "upload.jpg" }, [buf]);
    },
  };
})();
