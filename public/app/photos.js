// เปิดรูปกระดาษคำตอบจากมือถือให้ใช้ได้ทุกเครื่อง
// - iPhone ถ่ายเป็น .heic/.heif → Safari เปิดได้เอง · เบราว์เซอร์อื่น (Chrome, Android, คอม) แปลงเป็น JPEG ด้วย heic2any
//   (app/vendor/heic2any.min.js ~1.3MB โหลดเฉพาะตอนเจอไฟล์ HEIC)
// - หมุนรูปตามข้อมูลกล้อง (EXIF) · รูปใหญ่เกิน MAX_SIDE ย่อลง · ไฟล์ที่ไม่ใช่ JPEG/PNG/WebP แปลงเป็น JPEG

const PHOTOS_BASE = document.currentScript?.src || location.href;

const Photos = (() => {
  const MAX_SIDE = 2400; // ทดสอบกับ data/Test: อ่านได้เท่ากับ 3000 แต่ไฟล์เล็กลงครึ่งหนึ่ง (~650 KB/แผ่น)
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
      blob = await new Promise((ok) => cv.toBlob(ok, "image/jpeg", 0.88));
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

  // ---------- ดัดภาพตามมุมที่ครูครอบ (ก่อนส่งเข้าระบบตรวจ) ----------
  // corners = 4 มุม [x,y] สัดส่วน 0–1 เรียง บนซ้าย → บนขวา → ล่างขวา → ล่างซ้าย
  // ขยายกรอบออกนิดหน่อย (MARGIN) ให้เครื่องหมายมุมกระดาษไม่ถูกตัดหาย · ได้ JPEG ด้านยาวไม่เกิน WARP_MAX
  const WARP_MAX = 2400, MARGIN = 0.02;

  // homography จากสี่เหลี่ยมผืนผ้า (0,0)-(1,1) → quad (แก้สมการ 8 ตัวแปรแบบปิด)
  function unitToQuad([[x0, y0], [x1, y1], [x2, y2], [x3, y3]]) {
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
    const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1;
    const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
    return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h];
  }

  async function warp(blob, corners) {
    const img = await decode(blob);
    if (!img) throw new Error("เปิดรูปไม่ได้");
    const [iw, ih] = sizeOf(img);
    const cx = corners.reduce((a, p) => a + p[0], 0) / 4, cy = corners.reduce((a, p) => a + p[1], 0) / 4;
    const q = corners.map(([x, y]) => [(cx + (x - cx) * (1 + 2 * MARGIN)) * iw, (cy + (y - cy) * (1 + 2 * MARGIN)) * ih]);
    const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let W = Math.max(len(q[0], q[1]), len(q[3], q[2])), H = Math.max(len(q[0], q[3]), len(q[1], q[2]));
    const s = Math.min(1, WARP_MAX / Math.max(W, H));
    W = Math.round(W * s); H = Math.round(H * s);

    const src = document.createElement("canvas");
    src.width = iw; src.height = ih;
    const sg = src.getContext("2d", { willReadFrequently: true });
    sg.fillStyle = "#fff"; sg.fillRect(0, 0, iw, ih);
    sg.drawImage(img, 0, 0, iw, ih);
    img.close?.();
    const sd = sg.getImageData(0, 0, iw, ih).data;
    src.width = src.height = 0;

    const out = document.createElement("canvas");
    out.width = W; out.height = H;
    const og = out.getContext("2d");
    const od = og.createImageData(W, H), o = od.data;
    const [a, b, c, d, e, f, g, h] = unitToQuad(q);
    for (let y = 0; y < H; y++) {
      const v = (y + 0.5) / H;
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / W, z = g * u + h * v + 1;
        let px = (a * u + b * v + c) / z - 0.5, py = (d * u + e * v + f) / z - 0.5;
        const k = (y * W + x) * 4;
        if (px < 0 || py < 0 || px > iw - 1 || py > ih - 1) { o[k] = o[k + 1] = o[k + 2] = 255; o[k + 3] = 255; continue; }
        const x0 = px | 0, y0 = py | 0, x1 = Math.min(x0 + 1, iw - 1), y1 = Math.min(y0 + 1, ih - 1), fx = px - x0, fy = py - y0;
        const i00 = (y0 * iw + x0) * 4, i10 = (y0 * iw + x1) * 4, i01 = (y1 * iw + x0) * 4, i11 = (y1 * iw + x1) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const top = sd[i00 + ch] + (sd[i10 + ch] - sd[i00 + ch]) * fx, bot = sd[i01 + ch] + (sd[i11 + ch] - sd[i01 + ch]) * fx;
          o[k + ch] = top + (bot - top) * fy;
        }
        o[k + 3] = 255;
      }
    }
    og.putImageData(od, 0, 0);
    const jpg = await new Promise((ok) => out.toBlob(ok, "image/jpeg", 0.92));
    out.width = out.height = 0;
    return jpg;
  }

  // ---------- หาขอบกระดาษอัตโนมัติ (ก่อนครูครอบภาพ) ----------
  // ย่อรูป → หาพื้นที่ "ขาวและไม่มีสี" (กระดาษ) ด้วย Otsu → เอาก้อนที่ใหญ่สุด → มุม 4 มุม = จุดสุดขอบของก้อน
  // (บนซ้าย = x+y น้อยสุด, ล่างขวา = x+y มากสุด, บนขวา = x−y มากสุด, ล่างซ้าย = x−y น้อยสุด)
  // คืน corners สัดส่วน 0–1 · หาไม่เจอ (กระดาษเล็กเกินไป / พื้นสีขาวกลืนกระดาษ) = null → ครูลากเอง
  const FIND_SIDE = 480, MIN_AREA = 0.12, SAT_MAX = 40, ERODE = 2;
  function otsu(hist, n) {
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sB = 0, wB = 0, best = 0, t = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      const wF = n - wB;
      if (!wF) break;
      sB += i * hist[i];
      const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2;
      if (v > best) { best = v; t = i; }
    }
    return t;
  }

  async function findPaper(blob) {
    const img = await decode(blob);
    if (!img) return null;
    const [iw, ih] = sizeOf(img), s = Math.min(1, FIND_SIDE / Math.max(iw, ih));
    const W = Math.max(1, Math.round(iw * s)), H = Math.max(1, Math.round(ih * s));
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, W, H);
    img.close?.();
    const px = g.getImageData(0, 0, W, H).data;
    cv.width = cv.height = 0;

    const N = W * H, gray = new Uint8Array(N), sat = new Uint8Array(N), hist = new Uint32Array(256);
    for (let i = 0, k = 0; i < N; i++, k += 4) {
      const r = px[k], gg = px[k + 1], b = px[k + 2];
      gray[i] = (r * 299 + gg * 587 + b * 114) / 1000;
      sat[i] = Math.max(r, gg, b) - Math.min(r, gg, b);
      hist[gray[i]]++;
    }
    const t = otsu(hist, N);
    // กระดาษ = สว่างกว่าเกณฑ์ และสีจางกว่า "สีของพื้นหลัง" (เทียบกับขอบภาพ — โต๊ะไม้สีครีมมีสีมากกว่ากระดาษ)
    let m = new Uint8Array(N);
    for (let i = 0; i < N; i++) m[i] = gray[i] > t && sat[i] < SAT_MAX ? 1 : 0;
    // กัดขอบ 2 รอบ: ตัดสะพานบางๆ ที่เชื่อมกระดาษกับพื้นสีอ่อน (เงา/โต๊ะ) ออกจากกัน
    for (let r = 0; r < ERODE; r++) {
      const e = new Uint8Array(N);
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        e[i] = m[i] & m[i - 1] & m[i + 1] & m[i - W] & m[i + W];
      }
      m = e;
    }
    const mask = m;

    // ก้อนพื้นที่ขาวที่ใหญ่ที่สุด (4 ทิศ)
    const label = new Int32Array(N), stack = new Int32Array(N);
    let bestId = 0, bestN = 0, id = 0;
    for (let i = 0; i < N; i++) {
      if (!mask[i] || label[i]) continue;
      id++;
      let top = 0, n = 0;
      stack[top++] = i; label[i] = id;
      while (top) {
        const p = stack[--top]; n++;
        const x = p % W;
        if (x > 0 && mask[p - 1] && !label[p - 1]) { label[p - 1] = id; stack[top++] = p - 1; }
        if (x < W - 1 && mask[p + 1] && !label[p + 1]) { label[p + 1] = id; stack[top++] = p + 1; }
        if (p >= W && mask[p - W] && !label[p - W]) { label[p - W] = id; stack[top++] = p - W; }
        if (p < N - W && mask[p + W] && !label[p + W]) { label[p + W] = id; stack[top++] = p + W; }
      }
      if (n > bestN) { bestN = n; bestId = id; }
    }
    if (bestN < N * MIN_AREA) return null;

    let tl = [0, 0, Infinity], br = [0, 0, -Infinity], tr = [0, 0, -Infinity], bl = [0, 0, Infinity];
    for (let i = 0; i < N; i++) {
      if (label[i] !== bestId) continue;
      const x = i % W, y = (i / W) | 0, a = x + y, d = x - y;
      if (a < tl[2]) tl = [x, y, a];
      if (a > br[2]) br = [x, y, a];
      if (d > tr[2]) tr = [x, y, d];
      if (d < bl[2]) bl = [x, y, d];
    }
    // กระดาษแตะขอบภาพ ≥ 3 ด้าน = ถ่ายใกล้/สแกนมา → ใช้เต็มภาพ (มุมที่มืดเพราะแสงไม่ทำให้ครอบเบี้ยว)
    const xs = [tl, tr, br, bl].map((p) => p[0]), ys = [tl, tr, br, bl].map((p) => p[1]), edge = 0.015;
    const touch = [Math.min(...xs) < W * edge, Math.max(...xs) > W * (1 - edge) - 1, Math.min(...ys) < H * edge, Math.max(...ys) > H * (1 - edge) - 1].filter(Boolean).length;
    if (touch >= 3) return [[0, 0], [1, 0], [1, 1], [0, 1]];
    const out = [[-1, -1], [1, -1], [1, 1], [-1, 1]]; // ชดเชยที่กัดขอบไป
    const corners = [tl, tr, br, bl].map(([x, y], k) => [Math.min(1, Math.max(0, (x + 0.5 + out[k][0] * ERODE) / W)), Math.min(1, Math.max(0, (y + 0.5 + out[k][1] * ERODE) / H))]);
    // รูปร่างแปลก (มุมซ้อนกัน / ด้านสั้นเกินไป) → ไม่เชื่อ ให้ครูลากเอง
    const len = (a, b) => Math.hypot((a[0] - b[0]) * W, (a[1] - b[1]) * H);
    const sides = [0, 1, 2, 3].map((k) => len(corners[k], corners[(k + 1) % 4]));
    if (Math.min(...sides) < Math.max(W, H) * 0.2) return null;
    return corners;
  }

  // รูปย่อสำหรับรายการ (ด้านยาว 240px) — รายการหลายสิบแผ่นไม่ต้องถอดรหัสรูปเต็มทีละรูป
  async function thumb(blob, side = 240) {
    const img = await decode(blob);
    if (!img) return null;
    const [w, h] = sizeOf(img), s = Math.min(1, side / Math.max(w, h));
    const cv = document.createElement("canvas");
    cv.width = Math.round(w * s); cv.height = Math.round(h * s);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    img.close?.();
    const out = await new Promise((ok) => cv.toBlob(ok, "image/jpeg", 0.75));
    cv.width = cv.height = 0;
    return out;
  }

  return { ACCEPT, open, openMany, isHeic, warp, findPaper, thumb };
})();
