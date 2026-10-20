// Examer pipeline — จุดเดียวที่หน้า app เรียกระบบตรวจ (รูปแบบข้อมูล: docs/ENGINE.md) + เกณฑ์ให้คะแนน
//
// โมเดลรันในเบราว์เซอร์ (js/engine.js → js/engine-worker.js) ไม่มี server
// ตั้งค่า "โหมดจำลอง" ได้ในหน้าตั้งค่า (ใช้ทดสอบหน้าจอโดยไม่ต้องโหลดโมเดล)
//
// Result (ฟิลด์ที่หน้า app ใช้):
//   student_id, subject_id, school_id: string     // ตัวเลขจากช่องรหัสส่วนหัว
//   header?: { student_id: {value, min_conf, review}, ... }
//   set|question_set: 1|2|3|null, page: 1–4|null  // วงกลม ชุดกระดาษคำถาม / หน้ากระดาษคำตอบ
//   images?: { rectified, overlay }               // ภาพหลังตัดขอบ / ภาพตีกรอบช่อง (dataURL)
//   cells: { box: {x,y,w,h} }                     // กรอบตาราง (สัดส่วน 0–1)
//   reads: Cell[20][20]   Cell = { char, conf, cls: "char"|"empty"|"crossed", bbox?: [x1,y1,x2,y2], top3?: [[ch,p]] }
//   quality?: { markers_found, timing_bars, warnings }, timing_ms?

const ROWS = 20;
const COLS = 20;
const SETS = [1, 2, 3];

const DEMO_KEY = [
  "CAT", "VISION", "MODEL", "PIXEL", "TEACHER", "SCHOOL", "ANSWER", "GRADE", "LETTER", "PAPER",
  "NEURAL", "CAMERA", "TABLE", "MOBILE", "SCORE", "EXAM", "WRITE", "READ", "SHEET", "THAILAND",
];

const Pipeline = {
  isLive: () => Settings.get().engine === "browser",

  async run(file, exam, ctx = {}) {
    if (this.isLive()) return BrowserEngine.grade(file);
    await new Promise((r) => setTimeout(r, 120));
    return mockResult(exam, ctx);
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
    const answer = (key[(page - 1) * ROWS + i] || DEMO_KEY[i]).slice(0, COLS);
    reads.push(mockRow(studentWrites(answer)));
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
    } else if (r < 0.06) {
      const wrong = CONFUSABLE[ch] || ch;
      row.push({ char: wrong, conf: 0.3 + rand() * 0.25, cls: "char", truth: ch, top3: [[wrong, 0.45], [ch, 0.4], [randLetter(), 0.05]] });
    } else if (r < 0.08) {
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
  g.fillText(`รหัสประจำตัว  ${result.student_id || "—"}      ชุด ${result.set}   หน้า ${result.page}`, 60, 120);
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
    if (!answer) return { ...r, status: "nokey", points: 0, max: 0, note: "" };
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
