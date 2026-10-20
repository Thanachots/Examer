// เปิดรูปกระดาษคำตอบจากมือถือให้ใช้ได้ทุกเครื่อง
// - iPhone ถ่ายเป็น .heic/.heif → Safari เปิดได้เอง · เบราว์เซอร์อื่น (Chrome, Android, คอม) แปลงเป็น JPEG ด้วย heic2any
//   (app/vendor/heic2any.min.js ~1.3MB โหลดเฉพาะตอนเจอไฟล์ HEIC)
// - หมุนรูปตามข้อมูลกล้อง (EXIF) · รูปใหญ่เกิน MAX_SIDE ย่อลง · ไฟล์ที่ไม่ใช่ JPEG/PNG/WebP แปลงเป็น JPEG

const PHOTOS_BASE = document.currentScript?.src || location.href;

const Photos = (() => {
  const MAX_SIDE = 3000;
  const ACCEPT = "image/*,.heic,.heif"; // ใส่ .heic/.heif ด้วย ไม่งั้นบางเครื่องเลือกไฟล์ HEIC ไม่ได้
  const KEEP = /^image\/(jpeg|png|webp)$/i;
  const isHeic = (f) => /image\/hei[cf]/i.test(f.type) || /\.(heic|heif)$/i.test(f.name || "");

  let heicLib = null;
  const loadHeic = () => (heicLib ||= new Promise((ok, no) => {
    const s = document.createElement("script");
    s.src = new URL("vendor/heic2any.min.js", PHOTOS_BASE).href;
    s.onload = () => ok(window.heic2any);
    s.onerror = () => { heicLib = null; no(new Error("โหลดตัวแปลงไฟล์ HEIC ไม่ได้")); };
    document.head.append(s);
  }));

  // ถอดรูปเป็นภาพที่วาดได้ (หมุนตาม EXIF แล้ว) — เปิดไม่ได้ = null
  async function decode(blob) {
    try { return await createImageBitmap(blob, { imageOrientation: "from-image" }); } catch {}
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    } catch { return null; }
    // url ไม่ revoke: <img> ที่ได้ต้องใช้วาดต่อ (เกิดเฉพาะเบราว์เซอร์เก่า)
  }

  const sizeOf = (img) => [img.naturalWidth || img.width, img.naturalHeight || img.height];

  // file → { blob, url, w, h, name } · เปิดไม่ได้ → throw พร้อมข้อความที่ครูอ่านเข้าใจ
  async function open(file) {
    let blob = file, img = await decode(file), converted = false;
    if (!img && isHeic(file)) {
      const heic2any = await loadHeic();
      const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
      blob = Array.isArray(out) ? out[0] : out; // ไฟล์ Live Photo/หลายภาพ → ใช้ภาพแรก
      img = await decode(blob);
      converted = true;
    }
    if (!img) throw new Error(`เปิดไฟล์ ${file.name || "นี้"} ไม่ได้ — ใช้รูป JPG, PNG หรือ HEIC`);

    let [w, h] = sizeOf(img);
    const big = Math.max(w, h);
    if (big > MAX_SIDE || (!converted && !KEEP.test(blob.type))) {
      const s = Math.min(1, MAX_SIDE / big);
      const cv = document.createElement("canvas");
      cv.width = Math.round(w * s); cv.height = Math.round(h * s);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      blob = await new Promise((ok) => cv.toBlob(ok, "image/jpeg", 0.92));
      [w, h] = [cv.width, cv.height];
    }
    img.close?.();
    return { blob, url: URL.createObjectURL(blob), w, h, name: file.name || "" };
  }

  // หลายไฟล์ทีละไฟล์ (แปลง HEIC ใช้หน่วยความจำเยอะ) · ไฟล์ที่เปิดไม่ได้ข้ามไป แล้วคืนข้อความ error
  async function openMany(files, onProgress = () => {}) {
    const ok = [], errors = [];
    let i = 0;
    for (const f of files) {
      onProgress(++i, files.length);
      try { ok.push(await open(f)); } catch (err) { errors.push(err.message); }
    }
    return { ok, errors };
  }

  return { ACCEPT, open, openMany, isHeic };
})();
