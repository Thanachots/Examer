// Web Worker: Pyodide (Python ในเบราว์เซอร์) + onnxruntime-web · ทำงานในเครื่องทั้งหมด ไม่ส่งรูปออกไปไหน
importScripts('ort.wasm.min.js', 'pyodide/pyodide.js');
const base = self.location.href.replace(/[^/]*$/, '');
ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = base;
const sess = {};
self.ortRun = async (name, flat, n, h, w) => {
  if (!sess[name]) sess[name] = await ort.InferenceSession.create(base + 'models/' + name + '.onnx', { executionProviders: ['wasm'] });
  const s = sess[name], out = await s.run({ x: new ort.Tensor('float32', Float32Array.from(flat), [n, 1, h, w]) });
  return Array.from(out[s.outputNames[0]].data);
};
const FILES = ['examer/__init__.py', 'examer/pipeline.py', 'examer/phase1/phase1_v1.py', 'examer/phase1/phase1_v2_locked.py', 'examer/phase1/phase1_v3_locked.py',
  'examer/phase1/phase1_v4_locked.py', 'examer/phase1/bars_ref.json', 'examer/phase2/phase2a_locked.py', 'examer/phase3/run/p3lib_v5.py', 'examer/phase3/data/print_template.npz', 'web_pipeline.py'];
let py = null, ready = null;
async function boot() {
  postMessage({ type: 'boot', msg: 'โหลด Python' });
  py = await loadPyodide({ indexURL: base + 'pyodide/' });
  postMessage({ type: 'boot', msg: 'โหลด OpenCV · NumPy · Pillow' });
  await py.loadPackage(['numpy', 'opencv-python', 'pillow', 'pillow-heif']);
  for (const f of FILES) { py.FS.mkdirTree('/py/' + f.split('/').slice(0, -1).join('/')); py.FS.writeFile('/py/' + f, new Uint8Array(await (await fetch(base + 'py/' + f)).arrayBuffer())); }
  await py.runPythonAsync("import sys; sys.path.insert(0, '/py'); import pillow_heif; pillow_heif.options.DECODE_THREADS = 0; import web_pipeline as W");
  postMessage({ type: 'ready' });
}
self.onmessage = async (e) => {
  try {
    if (!ready) ready = boot(); await ready;
    if (e.data.type !== 'read') return;
    const ext = String(e.data.ext || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg', path = '/in.' + ext;
    py.FS.writeFile(path, new Uint8Array(e.data.buf));
    const r = await py.runPythonAsync(`import json, base64\nR = await W.read_sheet('${path}')\nif 'scan_jpg' in R: R['scan_jpg'] = base64.b64encode(R['scan_jpg']).decode()\njson.dumps(R, ensure_ascii=False)`);
    py.FS.unlink(path); postMessage({ type: 'result', id: e.data.id, result: JSON.parse(r) });
  } catch (err) { postMessage({ type: 'error', id: e.data && e.data.id, msg: String(err && err.message || err).slice(-600) }); }
};
