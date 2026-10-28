// Examer pipeline — จุดเดียวที่หน้า app เรียกระบบตรวจ (รูปแบบข้อมูล: docs/ENGINE.md) + เกณฑ์ให้คะแนน
//
// โมเดลจริง = engine/ ของ Prame (Pyodide + onnxruntime-web) รันในเบราว์เซอร์ทั้งหมด ไม่มี server ไม่ส่งรูปออก [claude/gelatin · 2026-10-28]
//   Engine (ด้านล่าง) ห่อ Examer ใน engine/examer.js · fromModel แปลงผลของโมเดล (rows/cells) → รูปแบบที่หน้า app ใช้ (reads)
// ตั้งค่า "โหมดจำลอง" ได้ในหน้าตั้งค่า (ใช้ทดสอบหน้าจอโดยไม่ต้องโหลดโมเดล) · รูปตัวอย่างใช้ผลจำลองเสมอ
//
// Result (ฟิลด์ที่หน้า app ใช้):
//   student_id, subject_id, school_id: string     // ตัวเลขจากช่องรหัสส่วนหัว (โมเดลตอนนี้ยังไม่อ่าน → "")
//   header?: { student_id: {value, min_conf, review}, ... }
//   set|question_set: 1|2|3|null, page: 1–4|null  // วงกลม ชุดกระดาษคำถาม / หน้ากระดาษคำตอบ (โมเดลยังไม่อ่านชุด → สุ่มไว้ก่อน ครูเลือกเองได้)
//   images?: { rectified, overlay }               // ภาพหลังตัดขอบ / ภาพตีกรอบช่อง (dataURL)
//   cells: { box: {x,y,w,h} }                     // กรอบตาราง (สัดส่วน 0–1)
//   reads: Cell[20][20]   Cell = { char, conf, cls: "char"|"empty"|"crossed", bbox?: [x1,y1,x2,y2] (สัดส่วน 0–1), top3?: [[ch,p]] }
//   quality?: { markers_found, timing_bars, warnings }, timing_ms?
//   model?: { seconds, needs_review, line_rows }    // จากโมเดลจริงเท่านั้น

const ROWS = 20;
const COLS = 20;
const SETS = [1, 2, 3];

const DEMO_KEY = [
  "CAT", "VISION", "MODEL", "PIXEL", "TEACHER", "SCHOOL", "ANSWER", "GRADE", "LETTER", "PAPER",
  "NEURAL", "CAMERA", "TABLE", "MOBILE", "SCORE", "EXAM", "WRITE", "READ", "SHEET", "THAILAND",
];

// ---------- โมเดลจริง (engine/examer.js) ---------- [claude/gelatin · 2026-10-28]
// state: idle (ยังไม่โหลด) · loading · ready · error — หน้าตั้งค่า/หน้าตรวจฟังด้วย onChange
const Engine = (() => {
  let st = { status: "idle", text: "" }, waiting = null, onStep = null;
  const subs = new Set();
  const set = (patch) => { st = { ...st, ...patch }; subs.forEach((f) => { try { f(st); } catch {} }); };
  const has = () => typeof Examer !== "undefined";
  if (has()) {
    Examer.onProgress = (msg, step) => { if (step) onStep?.(step, msg); }; // ข้อความของ worker เป็นศัพท์เทคนิค → หน้าตั้งค่าแสดง "กำลังโหลด" อย่างเดียว
    Examer.onReady = () => { set({ status: "ready", text: "", error: "" }); waiting?.ok(); waiting = null; };
    Examer.onError = (msg) => { set({ status: "error", error: msg }); waiting?.fail(new Error(msg)); waiting = null; Examer.reset(); };
  }
  return {
    available: has,
    state: () => st,
    isReady: () => st.status === "ready",
    onChange(f) { subs.add(f); return () => subs.delete(f); },
    // โหลด Python + โมเดล (~50 MB ครั้งแรก ครั้งต่อไปเบราว์เซอร์จำไว้) · เรียกซ้ำได้ ไม่โหลดซ้ำ
    load() {
      if (!has()) return Promise.reject(new Error("ไม่พบระบบตรวจ (engine/examer.js)"));
      if (st.status === "ready") return Promise.resolve();
      if (!waiting) {
        let ok, fail;
        const p = new Promise((a, b) => { ok = a; fail = b; });
        waiting = { p, ok, fail };
        set({ status: "loading", text: "กำลังโหลดระบบตรวจ", error: "" });
        Examer.warmup();
      }
      return waiting.p;
    },
    // อ่านกระดาษ 1 แผ่น → ผลดิบของโมเดล · step(1–4) = Phase 1 / 2A / 2B / 3
    async read(file, step) {
      await this.load();
      onStep = step || null;
      try { return await Examer.read(file); } finally { onStep = null; }
    },
  };
})();

// ผลของโมเดล (model/README.md: rows[].mode "cell" → cells 20 ช่อง "A–Z" / "" ว่าง / "-" ขีดฆ่า / "?" ไม่แน่ใจ ·
// "line" = เขียนทับเส้นตาราง มีแค่ letters เรียงกัน) → Result ของหน้า app
// กรอบ (boxes) อยู่บนภาพสแกน 2480×3508 → แปลงเป็นสัดส่วน 0–1 · "?" ให้ conf = 0 → ครูต้องตรวจข้อนั้นเสมอ
const SCAN_W = 2480, SCAN_H = 3508;
function fromModel(R, exam) {
  if (!R?.ok) {
    // ข้อความจากโมเดลขึ้นต้นด้วยชื่อเฟส (Phase 1: ...) → แปลงเป็นคำที่ครูเข้าใจ
    const e = String(R?.error || "");
    throw new Error(/^Phase 1/i.test(e) ? "หากระดาษในรูปไม่เจอ ถ่ายใหม่ให้เห็นสี่เหลี่ยมดำที่มุมกระดาษครบ 3 มุม"
      : /^Phase 2/i.test(e) ? "หาตารางคำตอบไม่ครบ 20 ข้อ ถ่ายใหม่ให้เห็นทั้งแผ่นและไม่เอียง"
      : e.replace(/^Phase \w+:\s*/i, "") || "อ่านกระดาษไม่สำเร็จ");
  }
  const bb = (b) => (b ? [b[0] / SCAN_W, b[1] / SCAN_H, b[2] / SCAN_W, b[3] / SCAN_H] : undefined);
  const cell = (ch, conf, box) => {
    if (!ch) return { char: "", conf: 1, cls: "empty" };
    if (ch === "-") return { char: "", conf: 1, cls: "crossed", bbox: bb(box) };
    if (ch === "?") return { char: "?", conf: 0, cls: "char", bbox: bb(box), unsure: true };
    return { char: ch, conf: conf ?? 1, cls: "char", bbox: bb(box) };
  };
  const reads = [];
  for (let i = 0; i < ROWS; i++) {
    const r = R.rows?.[i];
    const seq = !r ? [] : r.mode === "cell" ? r.cells : r.letters || [];
    const row = seq.slice(0, COLS).map((ch, k) => cell(ch, r.conf?.[k], r.boxes?.[k]));
    while (row.length < COLS) row.push({ char: "", conf: 1, cls: "empty" });
    if (r?.mode === "line") row.line = true;
    reads.push(row);
  }
  const sets = usedSets(exam);
  const warnings = [];
  if (R.qc_warning) warnings.push("ภาพเอียงหรือบิดมาก\u2003ถ้าผลดูแปลก ให้ถ่ายใหม่ให้ตรงกว่านี้");
  return {
    student_id: "", subject_id: "", school_id: "",
    set: sets[Math.floor(Math.random() * sets.length)], // โมเดลยังไม่อ่านวงกลมชุด → สุ่มไว้ก่อน (ครูเลือกเองได้)
    page: 1,
    images: R.scan_jpg ? { rectified: "data:image/jpeg;base64," + R.scan_jpg } : undefined,
    cells: { box: { x: 0, y: 0, w: 1, h: 1 } },
    reads,
    quality: { markers_found: R.phase1?.path === "markers" ? 3 : null, warnings },
    model: { seconds: R.seconds, needs_review: R.needs_review, line_rows: (R.rows || []).filter((r) => r.mode === "line").map((r) => r.row) },
  };
}

const Pipeline = {
  isLive: () => Settings.get().reader !== "mock" && Engine.available(),

  // ctx: { onStage(0–2) } — ขั้นที่หน้า app แสดง: 0 ตัดครอบภาพ · 1 จับช่องคำตอบ · 2 อ่านลายมือ
  async run(file, exam, ctx = {}) {
    if (!this.isLive()) {
      await new Promise((r) => setTimeout(r, 120));
      return mockResult(exam, ctx);
    }
    const R = await Engine.read(file, (step) => ctx.onStage?.(step <= 1 ? 0 : step === 2 ? 1 : 2));
    return fromModel(R, exam);
  },

  async demoSheet(exam, ctx) {
    const result = mockResult(exam, ctx);
    const blob = await renderSheet(result);
    return { blob, result };
  },
};

// ---------- โหมดจำลอง ----------

const rand = Math.random;
const randLetter = () => String.fromCharCode(65 + Math.floor(rand() * 26));
const CONFUSABLE = { O: "D", D: "O", Q: "O", U: "V", V: "U", I: "J", J: "I", L: "I", C: "G", G: "C", M: "N", N: "M", E: "F", B: "R" };

function usedSets(exam) {
  const s = SETS.filter((n) => (exam.keys?.[n] || []).some(Boolean));
  return s.length ? s : [1];
}

// ctx: { studentId, page }
function mockResult(exam, ctx = {}) {
  const sets = usedSets(exam);
  const set = sets[Math.floor(rand() * sets.length)];
  const page = ctx.page || 1;
  const key = exam.keys?.[set] || [];
  const reads = [];
  for (let i = 0; i < ROWS; i++) {
    // ข้อที่ไม่มีเฉลย = นักเรียนต้องเว้นว่าง → จำลองให้ส่วนใหญ่เว้นว่าง (บางแผ่นเผลอเขียน) [claude/gelatin · 2026-10-28]
    const answer = (key.some(Boolean) ? key[(page - 1) * ROWS + i] || (rand() < 0.03 ? DEMO_KEY[i] : "") : DEMO_KEY[i]).slice(0, COLS);
    reads.push(mockRow(answer ? studentWrites(answer) : ""));
  }
  const sid = ctx.studentId ?? String(10000 + Math.floor(rand() * 90000));
  return {
    student_id: sid,
    subject_id: "",
    school_id: "",
    header: { student_id: { value: sid, min_conf: sid ? 0.97 : 1, review: false } },
    set,
    page,
    cells: { box: { x: 0.1, y: 0.24, w: 0.8, h: 0.68 } },
    reads,
    mock: true,
  };
}

function studentWrites(answer) {
  const r = rand();
  if (r < 0.04) return "";
  if (r < 0.12) {
    const i = Math.floor(rand() * answer.length);
    return answer.slice(0, i) + randLetter() + answer.slice(i + 1);
  }
  if (r < 0.18) return DEMO_KEY[Math.floor(rand() * DEMO_KEY.length)];
  return answer;
}

function mockRow(word) {
  const row = [];
  for (const ch of word) {
    const r = rand();
    if (r < 0.03) {
      row.push({ char: randLetter(), conf: 0.9, cls: "crossed", truth: "" });
      row.push({ char: ch, conf: 0.95, cls: "char", truth: ch });
    } else if (r < 0.045) {
      const wrong = CONFUSABLE[ch] || ch;
      row.push({ char: wrong, conf: 0.3 + rand() * 0.25, cls: "char", truth: ch, top3: [[wrong, 0.45], [ch, 0.4], [randLetter(), 0.05]] });
    } else if (r < 0.06) {
      row.push({ char: ch, conf: 0.85, cls: "char", truth: ch, lower: true });
    } else {
      row.push({ char: ch, conf: 0.8 + rand() * 0.2, cls: "char", truth: ch });
    }
  }
  while (row.length < COLS) row.push({ char: "", conf: 0.99, cls: "empty" });
  return row.slice(0, COLS);
}

function renderSheet(result) {
  const W = 1000, H = 1414;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  g.fillStyle = "#fbfaf6"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#111";
  g.fillRect(40, H - 90, 50, 50); g.fillRect(W - 90, H - 90, 50, 50);
  g.fillRect(W - 110, 40, 70, 70);
  g.fillStyle = "#fff"; g.font = "bold 48px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("2", W - 75, 77);
  g.fillStyle = "#222"; g.textAlign = "left"; g.font = "28px sans-serif";
  g.fillText("กระดาษคำตอบ", 60, 70);
  g.font = "18px sans-serif";
  g.fillText(`รหัสประจำตัว  ${result.student_id || ""}      ชุด ${result.set}   หน้า ${result.page}`, 60, 120);
  g.strokeStyle = "#999"; g.strokeRect(60, 150, 520, 150);

  const b = result.cells.box;
  const x0 = b.x * W, y0 = b.y * H, cw = (b.w * W) / COLS, ch = (b.h * H) / ROWS;
  g.strokeStyle = "#555"; g.lineWidth = 1;
  for (let i = 0; i <= ROWS; i++) line(g, x0, y0 + i * ch, x0 + COLS * cw, y0 + i * ch);
  for (let j = 0; j <= COLS; j++) line(g, x0 + j * cw, y0, x0 + j * cw, y0 + ROWS * ch);
  g.fillStyle = "#111";
  for (let i = 0; i < ROWS; i++) {
    g.fillRect(x0 - 30, y0 + i * ch + ch * 0.35, 18, ch * 0.3);
    g.fillRect(x0 + COLS * cw + 12, y0 + i * ch + ch * 0.35, 18, ch * 0.3);
  }
  result.reads.forEach((row, r) =>
    row.forEach((cell, c) => drawGlyph(g, cell, x0 + c * cw, y0 + r * ch, cw, ch, `${r}-${c}`))
  );
  return new Promise((res) => cv.toBlob(res, "image/jpeg", 0.85));
}

function line(g, a, b, c, d) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }

function drawGlyph(g, cell, x, y, w, h, seed) {
  if (cell.cls === "empty") return;
  const s = hash(seed);
  const shown = cell.cls === "crossed" ? cell.char : cell.truth || cell.char;
  g.save();
  g.translate(x + w / 2 + (s[0] - 0.5) * w * 0.12, y + h / 2 + (s[1] - 0.5) * h * 0.12);
  g.rotate((s[2] - 0.5) * 0.3);
  g.fillStyle = "#1c2f7a";
  g.font = `${Math.round(h * 0.68)}px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(cell.lower ? shown.toLowerCase() : shown, 0, 0);
  if (cell.cls === "crossed") {
    g.strokeStyle = "#1c2f7a"; g.lineWidth = Math.max(1.5, h * 0.06);
    line(g, -w * 0.4, -h * 0.08, w * 0.4, -h * 0.08);
    line(g, -w * 0.4, h * 0.1, w * 0.4, h * 0.1);
  }
  g.restore();
}

function hash(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return [0, 1, 2].map((i) => (((h >>> (i * 8)) & 255) / 255));
}

// ---------- เกณฑ์ให้คะแนน (README ส่วนที่ 4) ----------

const Grade = {
  readRow(row, rules) {
    let first = -1, last = -1;
    row.forEach((c, i) => {
      if (c.cls !== "empty") { if (first < 0) first = i; last = i; }
    });
    let gap = false;
    for (let i = first; i >= 0 && i <= last; i++) if (row[i].cls === "empty") gap = true;
    const chars = row.filter((c) => c.cls === "char");
    return {
      word: chars.map((c) => c.char.toUpperCase()).join(""),
      gap,
      lateStart: first > 0,
      lower: chars.some((c) => c.lower),
      low: chars.some((c) => c.conf < rules.lowConf),
    };
  },

  question(row, answer, rules) {
    const r = this.readRow(row, rules);
    answer = (answer || "").toUpperCase();
    // ไม่มีเฉลย = ข้อนี้ต้องเว้นว่าง · ไม่นับคะแนน แต่ถ้านักเรียนเขียนไว้ ให้ครูเห็น (status extra) [claude/gelatin · 2026-10-28]
    if (!answer) return { ...r, status: r.word ? "extra" : "blank", points: 0, max: 0, note: r.word ? "ข้อนี้ต้องเว้นว่าง แต่มีคำตอบ (ไม่นับคะแนน)" : "" };
    const out = { ...r, max: 1, points: 0 };

    const problems = [];
    if (r.gap && rules.gap === "wrong") problems.push("เว้นช่องกลางคำ");
    if (r.lateStart && rules.start === "wrong") problems.push("ไม่เริ่มช่องแรก");
    if (r.lower && rules.lowercase === "wrong") problems.push("ตัวพิมพ์เล็ก");

    if (!r.word) { out.note = "ไม่ตอบ"; }
    else if (problems.length) { out.note = problems.join(", "); }
    else if (r.word === answer) { out.points = 1; }
    else if (r.word.length !== answer.length) { out.note = "ความยาวไม่ตรง"; }
    else {
      const same = [...answer].filter((ch, i) => r.word[i] === ch).length;
      if (rules.partial === "letters") out.points = same / answer.length;
      out.note = `ถูก ${same}/${answer.length} ตัว`;
    }

    out.status = r.low ? "review" : out.points === 1 ? "right" : out.points > 0 ? "partial" : "wrong";
    return out;
  },

  setOf: (sheet) => sheet.setOverride || sheet.result.set || sheet.result.question_set || 1,
  pageOf: (sheet) => sheet.pageOverride || sheet.result.page || 1,

  sheet(sheet, exam, rules) {
    const set = this.setOf(sheet);
    const page = this.pageOf(sheet);
    const off = (page - 1) * ROWS;
    const key = exam.keys?.[set] || [];
    const rows = sheet.result.reads.map((row, i) => ({ q: off + i + 1, key: key[off + i] || "", ...this.question(row, key[off + i], rules) }));
    const lowCells = sheet.result.reads.flat().filter((c) => c.cls === "char" && c.conf < rules.lowConf).length;
    return {
      set,
      page,
      rows,
      score: rows.reduce((s, r) => s + r.points, 0),
      max: rows.reduce((s, r) => s + r.max, 0),
      lowCells,
    };
  },
};
