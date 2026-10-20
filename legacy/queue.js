// คิวตรวจกระดาษเบื้องหลัง
// - เพิ่มภาพ → เก็บทันที (status: "pending") → ตรวจทีละแผ่นตามลำดับ
// - ครูไปหน้าอื่นได้ระหว่างตรวจ · ปิดหน้าแล้วเปิดใหม่ → ตรวจต่อจากที่ค้าง

// ภาพใหญ่เกินจำเป็น (เช่นกล้อง 48MP) → ย่อก่อนเก็บ · ภาพปกติเก็บไฟล์เดิม ไม่บีบซ้ำ
// (ทดสอบแล้ว: ย่อ/บีบ JPEG ซ้ำทำให้ผลอ่านช่องก้ำกึ่งเปลี่ยน 2–8 ช่อง/แผ่น จึงแตะเฉพาะไฟล์ที่ใหญ่จริงๆ)
const MAX_SIDE = 4200;
const MAX_BYTES = 8e6;

async function shrinkImage(file) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const big = Math.max(bmp.width, bmp.height);
    if (big <= MAX_SIDE && file.size <= MAX_BYTES) { bmp.close(); return file; }
    const s = Math.min(1, MAX_SIDE / big);
    const cv = document.createElement("canvas");
    cv.width = Math.round(bmp.width * s);
    cv.height = Math.round(bmp.height * s);
    cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
    bmp.close();
    const blob = await new Promise((res) => cv.toBlob(res, "image/jpeg", 0.92));
    return blob || file;
  } catch {
    return file; // เบราว์เซอร์เปิดไฟล์นี้ไม่ได้ (เช่น HEIC) → ส่งไฟล์เดิมให้ระบบตรวจแจ้ง error เอง
  }
}

const ScanQueue = (() => {
  let running = false;
  let current = null;
  let pending = 0;
  const listeners = new Set();
  const state = () => ({ running, current, pending });
  const emit = (done) => listeners.forEach((fn) => fn(state(), done));

  const isPending = (s) => s.status === "pending";

  async function loop() {
    if (running) return;
    running = true;
    try {
      for (;;) {
        const list = (await Store.all("sheets")).filter(isPending).sort((a, b) => a.createdAt - b.createdAt);
        pending = list.length;
        if (!list.length) break;
        const sh = list[0];
        current = sh.id;
        emit();
        const exam = await Store.get("exams", sh.examId);
        if (!exam) { await Store.del("sheets", sh.id); continue; }
        try {
          sh.result = await Pipeline.run(sh.image, exam);
          delete sh.error;
          sh.status = "done";
        } catch (err) {
          sh.error = err.message || String(err);
          sh.status = "error";
        }
        sh.checkedAt = Date.now();
        await Store.put("sheets", sh);
        current = null;
        pending = Math.max(0, pending - 1);
        emit(sh);
      }
    } finally {
      running = false;
      current = null;
      pending = 0;
      emit();
    }
  }

  return {
    state,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    kick() { loop(); },

    async add(files, exam) {
      let t = Date.now();
      for (const f of files) {
        const image = await shrinkImage(f);
        await Store.put("sheets", { id: uid(), examId: exam.id, fileName: f.name || "photo.jpg", createdAt: t++, image, status: "pending" });
        pending++;
        emit();
      }
      loop();
    },

    async retry(sheet) {
      delete sheet.error;
      delete sheet.result;
      sheet.status = "pending";
      await Store.put("sheets", sheet);
      loop();
    },
  };
})();

const sheetPending = (sh) => sh.status === "pending";
