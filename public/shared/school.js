// shared/school.js — ข้อมูลฝั่งโรงเรียน ใช้ทั้ง Dashboard (ฝ่ายวิชาการ) และแอปครู
// ต้องโหลดหลัง store.js (Store, Settings) และ pipeline.js (Grade)
//
// ที่เก็บ (IndexedDB เดียวกับแอป — เว็บเดียวกันจึงเห็นข้อมูลชุดเดียวกันในเครื่องเดียวกัน):
//   classes     { id, name: "ม.3/1", level: "ม.3", students: [{ no, sid, name }] }
//   subjects    { id, code: "อ23101", name: "ภาษาอังกฤษ 5", level, teacher: "ชื่อครู", rooms: ["ม.3/1"] }
//   exams       ข้อสอบรูปแบบเดียวกับแอปครู (format 2) · central: true = ข้อสอบกลางจากฝ่ายวิชาการ (ครูแก้เฉลยไม่ได้)
//   submissions { id: examId, ...ไฟล์ results ที่ครูส่งมา, importedAt }
// ยังไม่มี server → ส่งข้อมูลข้ามเครื่องด้วยไฟล์ .json (Transfer)

const SCHOOL_FORMAT = 2; // ตรงกับ FORMAT ใน app/app.js

const EXAM_KINDS = [["quiz", "สอบย่อย"], ["midterm", "กลางภาค"], ["final", "ปลายภาค"]];
const examKindLabel = (k) => EXAM_KINDS.find(([v]) => v === k)?.[1] || "";
const GRADE_LEVELS = ["ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6", "ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"];
const termLabel = (s = Settings.get()) => (s.term && s.year ? `ภาคเรียนที่ ${s.term}/${s.year}` : "");
const fmtNum = (n) => (n == null || Number.isNaN(n) ? "" : Number.isInteger(n) ? String(n) : n.toFixed(1));
const schoolId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const levelOf = (room) => (String(room).match(/^(ป|ม)\.\s?\d/) || [""])[0].replace(/\s/g, "");

const Roster = {
  // วางจาก Excel / Google Sheets / CSV: แต่ละบรรทัด = นักเรียน 1 คน
  // คอลัมน์เรียงแบบไหนก็ได้: เลขที่ (1–3 หลัก), เลขประจำตัว (4 หลักขึ้นไป), ชื่อ-สกุล · บรรทัดหัวตาราง (ไม่มีเลขประจำตัว) ข้ามไป
  parse(text) {
    const out = [];
    for (const raw of String(text).replace(/^﻿/, "").split(/\r?\n/)) {
      const cells = raw.split(/\t|,|;/).map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
      if (!cells.length) continue;
      let no = null, sid = null;
      const names = [];
      for (const c of cells) {
        if (/^\d{1,3}$/.test(c) && no === null) no = Number(c);
        else if (/^\d{4,}$/.test(c) && sid === null) sid = c;
        else names.push(c);
      }
      if (!sid) continue;
      out.push({ no, sid, name: names.join(" ") });
    }
    out.forEach((s, i) => { if (s.no === null) s.no = i + 1; });
    return out.sort((a, b) => a.no - b.no);
  },
  norm: (sid) => String(sid || "").replace(/\D/g, "").replace(/^0+/, ""),
};

// ---------- คะแนนของกระดาษ 1 แผ่น (เกณฑ์ตรวจ: Grade ใน pipeline.js) ----------
// คะแนนต่อข้อ = (ถูกทั้งคำ 1 / ได้บางส่วน 0–1 ตามเกณฑ์) × คะแนนของข้อนั้น · ครูสั่งนับถูก/ผิดได้
function gradeExamSheet(s, exam, rules = Settings.get()) {
  const keys = Object.fromEntries([1, 2, 3].map((k) => [k, k <= exam.sets ? exam.keys[k] || [] : []]));
  const g = Grade.sheet({ result: s.result, setOverride: s.setOverride }, { keys }, rules);
  const rows = g.rows.filter((r) => r.max > 0 && r.q <= exam.n).map((r) => {
    const w = exam.points[r.q - 1] ?? 1;
    const o = s.overrides?.[r.q];
    return o ? { ...r, max: w, points: o === "right" ? w : 0, status: o, override: true } : { ...r, max: w, points: r.points * w };
  });
  const score = rows.reduce((a, r) => a + r.points, 0), max = rows.reduce((a, r) => a + r.max, 0);
  return {
    rows, score, max, set: g.set,
    scaled: exam.scaleTo && max ? (score * exam.scaleTo) / max : null,
    review: rows.filter((r) => r.status === "review").length,
  };
}
const sheetStudentId = (s) => s.studentId ?? s.result?.student_id ?? "";

// คะแนนเต็มที่บันทึก (ปัดทศนิยม 1 ตำแหน่ง แบบที่ครูกรอก SGS)
const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

// รายชื่อนักเรียนของห้องที่สอบ (ตามชื่อห้องในข้อสอบ)
function examRoster(exam, classes) {
  const out = [];
  for (const room of exam.rooms || []) {
    const c = classes.find((x) => x.name === room);
    for (const st of c?.students || []) out.push({ ...st, room });
  }
  return out;
}

/**
 * คะแนนรายคนของการสอบ 1 ชุด (จากกระดาษที่บันทึกแล้ว + รายชื่อห้อง)
 * → { rows: [{ room, no, sid, name, score, max, scaled, review, sheetId, status, note }], counts }
 * status: done = ตรวจแล้ว · review = ยังมีข้อที่ระบบไม่แน่ใจ · absent = ไม่มีกระดาษ · unknown = เลขประจำตัวไม่อยู่ในรายชื่อ
 */
function examScores(exam, sheets, classes, rules = Settings.get()) {
  const roster = examRoster(exam, classes);
  const byId = new Map(roster.map((s) => [Roster.norm(s.sid), s]));
  const rows = new Map(roster.map((s) => [Roster.norm(s.sid), { ...s, status: "absent", score: null, max: null, scaled: null, review: 0, sheetId: null, note: "ไม่มีกระดาษคำตอบ", sheets: 0 }]));
  const extra = [];
  const max = exam.points.slice(0, exam.n).reduce((a, p) => a + p, 0);
  for (const s of [...sheets].sort((a, b) => a.createdAt - b.createdAt)) {
    if (!s.result) continue;
    const g = gradeExamSheet(s, exam, rules);
    const sid = sheetStudentId(s), k = Roster.norm(sid);
    const base = { score: g.score, max: g.max, scaled: g.scaled, review: g.review, sheetId: s.id, status: g.review ? "review" : "done", note: g.review ? `ระบบไม่แน่ใจ ${g.review} ข้อ` : "" };
    if (k && rows.has(k)) {
      const r = rows.get(k);
      r.sheets += 1;
      Object.assign(r, base, r.sheets > 1 ? { note: [`มี ${r.sheets} แผ่น ใช้แผ่นล่าสุด`, base.note].filter(Boolean).join(" · ") } : {});
    } else {
      extra.push({ room: "", no: null, sid, name: "", ...base, status: roster.length ? "unknown" : base.status,
        note: [!sid ? "อ่านเลขประจำตัวไม่ได้" : roster.length ? "ไม่พบเลขประจำตัวในรายชื่อ" : "", base.note].filter(Boolean).join(" · ") });
    }
  }
  const all = [...rows.values(), ...extra];
  all.forEach((r) => delete r.sheets);
  const scored = all.filter((r) => r.score != null);
  return {
    rows: all,
    max,
    counts: {
      roster: roster.length,
      scored: scored.length,
      absent: all.filter((r) => r.status === "absent").length,
      review: all.filter((r) => r.status === "review").length,
      unknown: all.filter((r) => r.status === "unknown").length,
      mean: scored.length ? scored.reduce((a, r) => a + r.score, 0) / scored.length : null,
    },
  };
}

// ---------- CSV สำหรับกรอกคะแนน (SGS / ปพ.5) ----------
// เรียง ห้อง → เลขที่ · คอลัมน์: ห้อง, เลขที่, เลขประจำตัว, ชื่อ-สกุล, คะแนน, คิดเป็น (ถ้ามี), หมายเหตุ
function scoresCsv(exam, rows, max = exam.points.slice(0, exam.n).reduce((a, p) => a + p, 0)) {
  const sorted = [...rows].sort((a, b) => String(a.room || "~").localeCompare(String(b.room || "~"), "th") || (a.no ?? 1e9) - (b.no ?? 1e9) || String(a.sid).localeCompare(String(b.sid)));
  const head = ["ห้อง", "เลขที่", "เลขประจำตัว", "ชื่อ-สกุล", `คะแนน (เต็ม ${fmtNum(max)})`, ...(exam.scaleTo ? [`คิดเป็น (เต็ม ${fmtNum(exam.scaleTo)})`] : []), "หมายเหตุ"];
  const body = sorted.map((r) => [r.room, r.no ?? "", r.sid, r.name, fmtNum(r.score), ...(exam.scaleTo ? [fmtNum(round1(r.scaled))] : []), r.note || ""]);
  return "﻿" + [head, ...body].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n"); // BOM → Excel อ่านภาษาไทยได้
}

// ---------- ส่งข้อมูลระหว่างฝ่ายวิชาการ ↔ ครู (ผ่านไฟล์ — ยังไม่มี server) ----------
const Transfer = {
  // ฝ่ายวิชาการ → ครู: ห้อง/รายชื่อ, รายวิชา, ข้อสอบกลาง, เกณฑ์ตรวจ · teacher = ชื่อครู (ว่าง = ทุกวิชา)
  async schoolPackage(teacher = "") {
    const s = Settings.get();
    const subjects = (await Store.all("subjects")).filter((x) => !teacher || x.teacher === teacher);
    const codes = new Set(subjects.map((x) => x.code));
    const exams = (await Store.all("exams")).filter((e) => e.central && e.format === SCHOOL_FORMAT && (!teacher || codes.has(e.subjectCode)));
    const rooms = new Set(teacher ? [...subjects.flatMap((x) => x.rooms || []), ...exams.flatMap((e) => e.rooms || [])] : []);
    const classes = (await Store.all("classes")).filter((c) => !teacher || rooms.has(c.name));
    return {
      app: "examer", type: "school-package", format: SCHOOL_FORMAT, createdAt: new Date().toISOString(),
      school: { name: s.schoolName, year: s.year, term: s.term },
      rules: { lowConf: s.lowConf, lowercase: s.lowercase, gap: s.gap, start: s.start, partial: s.partial },
      teacher, classes, subjects, exams,
    };
  },

  // แอปครู: นำเข้าไฟล์จากฝ่ายวิชาการ (ข้อสอบกลางที่ครูตรวจไปแล้วไม่ลบกระดาษ แค่อัปเดตเฉลย)
  async importPackage(d) {
    if (d?.app !== "examer" || d.type !== "school-package") throw new Error("ไม่ใช่ไฟล์ข้อมูลจากฝ่ายวิชาการ");
    if (d.format !== SCHOOL_FORMAT) throw new Error("ไฟล์นี้มาจาก Examer รุ่นเก่า — ให้ฝ่ายวิชาการสร้างไฟล์ใหม่");
    for (const c of d.classes || []) await Store.put("classes", c);
    for (const x of d.subjects || []) await Store.put("subjects", x);
    for (const e of d.exams || []) await Store.put("exams", { ...e, central: true, status: "ready" });
    Settings.set({
      schoolName: d.school?.name || "", year: d.school?.year || Settings.get().year, term: d.school?.term || Settings.get().term,
      ...(d.rules || {}), rulesFromSchool: !!d.rules,
      ...(d.teacher && !Settings.get().teacherName ? { teacherName: d.teacher } : {}),
    });
    return { classes: (d.classes || []).length, subjects: (d.subjects || []).length, exams: (d.exams || []).length };
  },

  // ครู → ฝ่ายวิชาการ: คะแนนรายคนของการสอบ 1 ชุด
  resultsFile(exam, sum, teacher) {
    const s = Settings.get();
    const keep = ["id", "name", "subject", "subjectCode", "kind", "date", "rooms", "n", "sets", "points", "scaleTo", "central"];
    return {
      app: "examer", type: "results", format: SCHOOL_FORMAT, sentAt: new Date().toISOString(),
      teacher: teacher || s.teacherName || "", school: s.schoolName, year: s.year, term: s.term,
      exam: Object.fromEntries(keep.map((k) => [k, exam[k] ?? null])),
      max: sum.max,
      students: sum.rows.map(({ room, no, sid, name, score, max, scaled, status, note }) => ({ room, no, sid, name, score, max, scaled: round1(scaled), status, note })),
      counts: sum.counts,
    };
  },

  // Dashboard: นำเข้าไฟล์คะแนนจากครู (ส่งซ้ำ = แทนของเดิม)
  async importResults(d) {
    if (d?.app !== "examer" || d.type !== "results") throw new Error("ไม่ใช่ไฟล์คะแนนจากครู");
    if (d.format !== SCHOOL_FORMAT) throw new Error("ไฟล์นี้มาจาก Examer รุ่นเก่า — ให้ครูส่งใหม่");
    await Store.put("submissions", { ...d, id: d.exam.id, importedAt: Date.now() });
    return d;
  },
};

async function readJsonFile(file) {
  try { return JSON.parse(await file.text()); }
  catch { throw new Error("เปิดไฟล์ไม่ได้ — ต้องเป็นไฟล์ .json จาก Examer"); }
}

function downloadFile(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const downloadJson = (obj, name) => downloadFile(new Blob([JSON.stringify(obj)], { type: "application/json" }), name);
const safeName = (s) => String(s || "").replace(/[\\/:*?"<>|]+/g, "-").trim() || "examer";
