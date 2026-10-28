// ใช้ในหน้าเว็บ:  <script src="examer.js"></script>
//   Examer.onProgress = (msg, step) => ...     (ไม่บังคับ) · step = 1–4 ตามเฟส ระหว่างอ่าน
//   Examer.onReady = () => ... · Examer.onError = (msg) => ...   (ไม่บังคับ) โหลดระบบเสร็จ / โหลดไม่สำเร็จ
//   const R = await Examer.read(file)          // file = File จาก <input type="file"> · คืน JSON ตาม README
//   Examer.reset()                             // ทิ้งตัวที่โหลดพัง แล้วเริ่มใหม่ตอนเรียกครั้งถัดไป
// ครั้งแรกโหลดประมาณ 10–30 วินาที (Python + OpenCV) · อ่านแผ่นละ ~20–60 วินาที ขึ้นกับเครื่อง
// [claude/gelatin · 2026-10-28] เพิ่ม step, onReady, onError, reset ให้แอปบอกสถานะได้ (worker.js ไม่ได้แก้)
(function () {
  const here = (document.currentScript && document.currentScript.src || location.href).replace(/[^/]*$/, '');
  let w = null, seq = 0; const wait = {};
  function worker() {
    if (w) return w; w = new Worker(here + 'worker.js');
    w.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'boot' || d.type === 'progress') { Examer.onProgress && Examer.onProgress(d.msg, d.step); return; }
      if (d.type === 'ready') { Examer.onProgress && Examer.onProgress('พร้อม'); Examer.onReady && Examer.onReady(); return; }
      const p = wait[d.id];
      if (!p) { if (d.type === 'error') Examer.onError && Examer.onError(d.msg); return; } // โหลดระบบไม่สำเร็จ (ตอน warmup)
      delete wait[d.id];
      d.type === 'result' ? p.ok(d.result) : p.fail(new Error(d.msg));
    };
    w.onerror = (e) => { const msg = (e && e.message) || 'โหลดระบบตรวจไม่สำเร็จ'; Examer.onError && Examer.onError(msg); for (const k in wait) { wait[k].fail(new Error(msg)); delete wait[k]; } };
    return w;
  }
  window.Examer = {
    onProgress: null, onReady: null, onError: null,
    warmup() { worker().postMessage({ type: 'warmup' }); },
    reset() { if (w) w.terminate(); w = null; for (const k in wait) { wait[k].fail(new Error('ยกเลิก')); delete wait[k]; } },
    async read(file) {
      const buf = await file.arrayBuffer(), id = ++seq, ext = (file.name.split('.').pop() || 'jpg');
      return new Promise((ok, fail) => { wait[id] = { ok, fail }; worker().postMessage({ type: 'read', id, buf, ext }, [buf]); });
    },
  };
})();
