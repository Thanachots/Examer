// ตัวช่วยเล็กๆ ที่ทุกหน้าใช้ร่วมกัน

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// object URL ของหน้าปัจจุบัน — ถูกคืนหน่วยความจำเมื่อเปลี่ยนหน้า
const Page = {
  urls: [],
  cleanups: [],
  url(blob) { const u = URL.createObjectURL(blob); this.urls.push(u); return u; },
  onLeave(fn) { this.cleanups.push(fn); },
  leave() {
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.cleanups.forEach((fn) => fn());
    this.urls = []; this.cleanups = [];
  },
};

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("โหลดภาพไม่ได้"));
    img.src = typeof src === "string" ? src : Page.url(src);
  });
}

function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function csvRow(cells) {
  return cells.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(",");
}

let toastTimer;
function toast(msg) {
  let el = $("#toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// ปุ่มที่ต้องกด 2 ครั้งเพื่อยืนยัน (แทน confirm())
function armButton(btn, label, action) {
  const orig = btn.textContent;
  let armed = false, t;
  btn.addEventListener("click", () => {
    if (!armed) {
      armed = true; btn.textContent = label; btn.classList.add("armed");
      t = setTimeout(() => { armed = false; btn.textContent = orig; btn.classList.remove("armed"); }, 3000);
      return;
    }
    clearTimeout(t);
    action();
  });
}

// ---------- ภาพ ----------
const MAX_W = 1000;

function fitCanvas(cv, w, h) {
  const s = Math.min(1, MAX_W / w);
  cv.width = Math.round(w * s);
  cv.height = Math.round(h * s);
  return cv.getContext("2d");
}

function drawImage(cv, img) {
  fitCanvas(cv, img.naturalWidth, img.naturalHeight).drawImage(img, 0, 0, cv.width, cv.height);
}

function drawGray(cv, img) {
  const g = fitCanvas(cv, img.naturalWidth, img.naturalHeight);
  g.drawImage(img, 0, 0, cv.width, cv.height);
  const d = g.getImageData(0, 0, cv.width, cv.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    d.data[i] = d.data[i + 1] = d.data[i + 2] = Math.max(0, Math.min(255, (v - 128) * 1.4 + 128));
  }
  g.putImageData(d, 0, 0);
}

function drawCellsOverlay(cv, src, result, highlight) {
  cv.width = src.width; cv.height = src.height;
  const g = cv.getContext("2d");
  g.drawImage(src, 0, 0);
  const W = cv.width, H = cv.height;
  const hasBoxes = result.reads[0]?.[0]?.bbox;
  g.lineWidth = 1.2;
  if (hasBoxes) {
    result.reads.forEach((row, r) => row.forEach((cell, c) => {
      const [x1, y1, x2, y2] = cell.bbox;
      g.strokeStyle = cell.cls === "crossed" ? "rgba(200,60,60,.9)" : cell.cls === "char" ? "rgba(30,150,105,.95)" : "rgba(30,150,105,.35)";
      g.strokeRect(x1 * W, y1 * H, (x2 - x1) * W, (y2 - y1) * H);
    }));
  } else {
    const b = result.cells.box;
    const x0 = b.x * W, y0 = b.y * H, w = b.w * W, h = b.h * H;
    g.strokeStyle = "rgba(30,150,105,.9)";
    for (let i = 0; i <= ROWS; i++) line(g, x0, y0 + (h * i) / ROWS, x0 + w, y0 + (h * i) / ROWS);
    for (let j = 0; j <= COLS; j++) line(g, x0 + (w * j) / COLS, y0, x0 + (w * j) / COLS, y0 + h);
  }
  if (highlight) {
    const [x1, y1, x2, y2] = cellBox(result, highlight.r, highlight.c);
    g.strokeStyle = "#e0662f"; g.lineWidth = 3;
    g.strokeRect(x1 * W, y1 * H, (x2 - x1) * W, (y2 - y1) * H);
  }
}

// กรอบของช่อง (สัดส่วน 0–1) — ใช้ bbox จากโมเดลถ้ามี ไม่งั้นแบ่งกรอบตารางเท่าๆ กัน
function cellBox(result, r, c) {
  const bb = result.reads[r][c].bbox;
  if (bb) return bb;
  const b = result.cells.box;
  const x1 = b.x + (b.w * c) / COLS, y1 = b.y + (b.h * r) / ROWS;
  return [x1, y1, x1 + b.w / COLS, y1 + b.h / ROWS];
}

// ภาพของช่องเดียว (คิวตรวจทาน / แผงช่องที่เลือก)
// มีภาพจริง (ผลโมเดล) → ตัดจากภาพที่ตัดขอบแล้ว · โหมดจำลอง → วาดลายมือจำลอง
function cellCrop(sheet, img, r, c, size = 84) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  cv.className = "crop";
  const g = cv.getContext("2d");
  g.fillStyle = "#fbfaf6"; g.fillRect(0, 0, size, size);
  const cell = sheet.result.reads[r][c];
  if (img && !sheet.result.mock) {
    const [x1, y1, x2, y2] = cellBox(sheet.result, r, c);
    const W = img.naturalWidth, H = img.naturalHeight;
    const pw = (x2 - x1) * W, ph = (y2 - y1) * H, pad = 0.08;
    g.drawImage(img, x1 * W - pw * pad, y1 * H - ph * pad, pw * (1 + 2 * pad), ph * (1 + 2 * pad), 0, 0, size, size);
  } else {
    g.strokeStyle = "#c9c5bb"; g.strokeRect(0.5, 0.5, size - 1, size - 1);
    drawGlyph(g, cell.orig ? { ...cell, ...cell.orig } : cell, 0, 0, size, size, `${r}-${c}`);
  }
  return cv;
}

// ภาพสำหรับตัดช่อง: ภาพที่โมเดลตัดขอบแล้ว ถ้าไม่มีใช้ภาพต้นฉบับ
const rectifiedSrc = (sheet) => sheet.result?.images?.rectified || sheet.result?.dewarped || null;

async function sheetImage(sheet) {
  try {
    return await loadImage(rectifiedSrc(sheet) || sheet.image);
  } catch {
    return null;
  }
}

// ---------- ส่วนที่ทุกหน้าใช้ ----------
const Views = {};

const pill = (cls, text) => `<span class="pill ${cls}">${esc(text)}</span>`;
const studentLabel = (s) => (s ? [s.no != null ? `เลขที่ ${s.no}` : "", s.name || s.sid].filter(Boolean).join(" · ") : "");

async function loadExamContext(examId) {
  const exam = await Store.get("exams", examId);
  if (!exam) return null;
  const classes = (await Promise.all((exam.classIds || []).map((id) => Store.get("classes", id)))).filter(Boolean);
  const sheets = await Store.sheetsOf(exam.id);
  const rules = Settings.get();
  return { exam, classes, sheets, rules, sum: summarizeExam(exam, sheets, classes, rules) };
}

// ตรวจไฟล์ทีละแผ่น แล้วเก็บ (ถ้าตรวจไม่ได้ก็เก็บไว้พร้อมข้อความ error ให้ครูลองใหม่/ลบ)
async function processFile(file, exam, onDone) {
  const sheet = { id: uid(), examId: exam.id, fileName: file.name, createdAt: Date.now(), image: file };
  try {
    sheet.result = await Pipeline.run(file, exam);
  } catch (err) {
    sheet.error = err.message || String(err);
  }
  await Store.put("sheets", sheet);
  onDone?.(sheet);
  return sheet;
}

function setCell(cell, v) {
  if (!cell.orig) cell.orig = { char: cell.char, conf: cell.conf, cls: cell.cls, lower: cell.lower };
  if (v === "empty") Object.assign(cell, { char: "", cls: "empty" });
  else if (v === "crossed") Object.assign(cell, { cls: "crossed" });
  else Object.assign(cell, { char: v, cls: "char" });
  cell.conf = 1;
  cell.lower = false;
  cell.edited = true;
}
