// engine-worker.js — รันโมเดลในเบราว์เซอร์ (Web Worker หน้าจอไม่ค้างระหว่างตรวจ)
//
// ① ② (ตัดขอบ / จับช่อง / เตรียมภาพช่อง): โค้ด Python ของ repo โมเดล รันด้วย Pyodide + OpenCV
//      — ดึงจาก repo Computer-Vision ตรงๆ (ไม่ได้ก๊อปมาไว้ใน Examer)
// ③ (อ่านตัวอักษร / ตัวเลข / ขีดฆ่า): โมเดล 3 ตัวที่แปลงเป็น ONNX รันด้วย onnxruntime-web
// ตัวกลางอยู่ที่ public/engine/examer_engine.py

const PY_SRC = [
  "src/preprocessing/dewarp.py",
  "src/detection/grid_extractor.py",
  "src/detection/strikethrough_detector.py",
  "src/recognition/char_classifier.py",
  "src/recognition/digit_classifier.py",
];
const ENGINE_PY = ["examer_engine.py", "torch/__init__.py", "torch/nn/__init__.py", "torch/nn/functional.py"];
const MODELS = { hcr: "hcr_az.onnx", digit: "hcr_digits.onnx", strike: "strike.onnx" };

let py = null, eng = null, sessions = null, ready = null;

const status = (text, p) => postMessage({ type: "status", text, p });

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`โหลดไฟล์ไม่ได้ (${r.status}): ${url}`);
  return r.text();
}

async function init(cfg) {
  status("กำลังโหลด Python…", 0.05);
  importScripts(cfg.pyodide + "pyodide.js");
  py = await loadPyodide({ indexURL: cfg.pyodide });

  status("กำลังโหลด OpenCV…", 0.3);
  await py.loadPackage(["numpy", "opencv-python"]);

  status("กำลังโหลดโค้ดตัดขอบ/จับช่อง…", 0.6);
  const files = [...PY_SRC.map((p) => [cfg.cvSrc + p, "/engine/" + p]), ...ENGINE_PY.map((p) => [cfg.engine + p, "/engine/" + p])];
  const texts = await Promise.all(files.map(([u]) => fetchText(u)));
  files.forEach(([, dst], i) => {
    py.FS.mkdirTree(dst.slice(0, dst.lastIndexOf("/")));
    py.FS.writeFile(dst, texts[i]);
  });

  status("กำลังโหลดโมเดลอ่านตัวอักษร…", 0.75);
  importScripts(cfg.ort + "ort.min.js");
  ort.env.wasm.wasmPaths = cfg.ort;
  ort.env.wasm.numThreads = 1;
  sessions = {};
  for (const [k, f] of Object.entries(MODELS)) sessions[k] = await ort.InferenceSession.create(cfg.engine + "models/" + f);

  status("กำลังเตรียมระบบตรวจ…", 0.95);
  py.globals.set("_meta", await fetchText(cfg.engine + "models/meta.json"));
  eng = py.runPython(`
import sys, json
sys.path.insert(0, "/engine")
from examer_engine import Engine
Engine(json.loads(_meta))`);
  status("พร้อม", 1);
}

async function grade({ buf, name }) {
  const insPy = eng.prepare_js(new Uint8Array(buf), name);
  const ins = insPy.toJs({ dict_converter: Object.fromEntries });
  insPy.destroy();

  const logits = {};
  for (const [k, arrs] of Object.entries(ins)) {
    const s = sessions[k];
    const feeds = {};
    arrs.forEach(([shape, u8], i) => {
      const f32 = new Float32Array(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
      feeds[s.inputNames[i]] = new ort.Tensor("float32", f32, shape);
    });
    const out = (await s.run(feeds))[s.outputNames[0]];
    logits[k] = [out.dims, out.data];
  }
  const arg = py.toPy(logits, { depth: 1 });
  const json = eng.finish_js(arg);
  arg.destroy();
  return JSON.parse(json);
}

// ข้อความ error จาก Python ยาวเป็น traceback → เก็บแค่บรรทัดสุดท้าย
const cleanError = (e) => {
  const msg = String(e?.message || e);
  const lines = msg.trim().split("\n").filter(Boolean);
  return lines[lines.length - 1].replace(/^\w+Error: /, "");
};

onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    if (type === "init") {
      ready ||= init(payload);
      await ready;
      postMessage({ id, ok: true });
    } else if (type === "grade") {
      await ready;
      postMessage({ id, ok: true, result: await grade(payload) });
    }
  } catch (err) {
    if (type === "init") ready = null;
    postMessage({ id, ok: false, error: cleanError(err) });
  }
};
