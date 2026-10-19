// Examer pipeline — จุดเดียวที่หน้า app เรียกระบบตรวจ
//
// โมเดลจะรันในเบราว์เซอร์ (ไม่มี server) — ตอนนี้ยังไม่ได้ต่อ จึงใช้ "โหมดจำลอง" (mock) ทั้ง 3 ส่วน
// ตอนต่อโมเดลจริง: แก้แค่ Pipeline.run() ให้เรียก engine แล้วคืนผลตามรูปแบบใน docs/ENGINE.md

const ROWS = 20;           // ข้อ 1–20
const COLS = 20;           // ช่องต่อข้อ
const LOW_CONF = 0.55;     // ต่ำกว่านี้ → ส่งครูตรวจ (ตรงกับ review_conf_threshold ของโมเดล)
const ENGINE = null;       // engine ที่รันในเบราว์เซอร์ (ยังไม่มี) — null = โหมดจำลอง

const Pipeline = {
  ROWS, COLS, LOW_CONF,
  isLive: () => Boolean(ENGINE),   // true เมื่อต่อโมเดลจริงแล้ว

  /**
   * @param {File} file ภาพกระดาษคำตอบ
   * @param {string[]} key เฉลย 20 ข้อ (โหมดจำลองใช้สร้างข้อมูลตัวอย่าง)
   * @returns {Promise<Result>}
   *
   * Result = {
   *   student_id: string,
   *   dewarp:  { corners: [[x,y] x4] | null, width, height },   // พิกัดในภาพต้นฉบับ
   *   cells:   { box: {x,y,w,h} },                              // กรอบตารางในภาพที่ปรับแล้ว (0–1)
   *   reads:   Cell[20][20]   // Cell = { char: "A"-"Z" | "", conf: 0–1, cls: "char"|"empty"|"crossed" }
   *   images?: { rectified: dataURL, overlay: dataURL }   // มีเมื่อต่อโมเดลจริง
   *   (ฟิลด์อื่นทั้งหมดดูใน docs/ENGINE.md)
   * }
   */
  async run(file, key) {
    if (ENGINE) return ENGINE.grade(file, key);   // TODO: ต่อ engine ในเบราว์เซอร์
    await new Promise((r) => setTimeout(r, 400));
    return mockResult(key);
  },
};

// ---------- โหมดจำลอง ----------

const DEMO_WORDS = [
  "CAT", "VISION", "MODEL", "PIXEL", "TEACHER", "SCHOOL", "ANSWER", "GRADE", "LETTER", "PAPER",
  "NEURAL", "CAMERA", "TABLE", "MOBILE", "SCORE", "EXAM", "WRITE", "READ", "SHEET", "THAILAND",
];

function mockResult(key) {
  const words = key.map((k, i) => (k || DEMO_WORDS[i]).slice(0, COLS));
  const reads = words.map((word) => mockRow(word));
  return {
    student_id: "67" + String(Math.floor(Math.random() * 1e6)).padStart(6, "0"),
    dewarp: { corners: null },
    cells: { box: { x: 0.12, y: 0.22, w: 0.80, h: 0.66 } },
    reads,
  };
}

function mockRow(word) {
  const row = [];
  for (const ch of word) {
    const r = Math.random();
    if (r < 0.04) {
      // ขีดฆ่าแล้วเขียนตัวที่ถูกต่อ
      row.push({ char: randLetter(), conf: 0.9, cls: "crossed" });
      row.push({ char: ch, conf: 0.95, cls: "char" });
    } else if (r < 0.10) {
      row.push({ char: confuse(ch), conf: 0.35 + Math.random() * 0.2, cls: "char" });
    } else {
      row.push({ char: ch, conf: 0.8 + Math.random() * 0.2, cls: "char" });
    }
  }
  while (row.length < COLS) row.push({ char: "", conf: 0.99, cls: "empty" });
  return row.slice(0, COLS);
}

const CONFUSABLE = { O: "D", D: "O", Q: "O", U: "V", V: "U", I: "J", J: "I", L: "I", C: "G", G: "C", M: "N", N: "M" };
const confuse = (c) => CONFUSABLE[c] || c;
const randLetter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));

// ---------- การให้คะแนน (ตามเกณฑ์ใน README ส่วนที่ 4) ----------

/**
 * รวมตัวอักษรในแถวเป็นคำ: ข้ามช่องว่างและช่องขีดฆ่า, พิมพ์เล็กนับเป็นพิมพ์ใหญ่
 * หมายเหตุ: กรณี "เว้นช่องกลางคำ" ยังไม่ได้ตกลงกัน — ตอนนี้ต่อกันเลย
 */
function rowToWord(row) {
  return row.filter((c) => c.cls === "char").map((c) => c.char.toUpperCase()).join("");
}

function gradeRow(row, answer) {
  const read = rowToWord(row);
  const review = row.some((c) => c.cls === "char" && c.conf < LOW_CONF);
  if (!answer) return { read, status: "nokey", review };
  if (!read) return { read, status: "wrong", review: false };       // ไม่ตอบ = 0
  if (review) return { read, status: "review", review };            // รอครูยืนยัน
  return { read, status: read === answer.toUpperCase() ? "right" : "wrong", review };
}

Pipeline.rowToWord = rowToWord;
Pipeline.gradeRow = gradeRow;
