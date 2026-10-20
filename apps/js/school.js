// ข้อมูลฝั่งโรงเรียน: รายชื่อนักเรียน, จับคู่กระดาษกับนักเรียน, สรุปทั้งการสอบ

const Roster = {
  // วางจาก Excel / Google Sheets / CSV: แต่ละบรรทัด = นักเรียน 1 คน
  // ยอมรับคอลัมน์ในลำดับใดก็ได้: เลขที่ (1–3 หลัก), เลขประจำตัว (≥4 หลัก), ชื่อ-สกุล
  parse(text) {
    const out = [];
    for (const raw of text.split(/\r?\n/)) {
      const cells = raw.split(/\t|,|;/).map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
      if (!cells.length) continue;
      let no = null, sid = null;
      const names = [];
      for (const c of cells) {
        if (/^\d{1,3}$/.test(c) && no === null) no = Number(c);
        else if (/^\d{4,}$/.test(c) && sid === null) sid = c;
        else names.push(c);
      }
      if (!sid) continue; // บรรทัดหัวตาราง หรือไม่มีเลขประจำตัว
      out.push({ no, sid, name: names.join(" ") });
    }
    out.forEach((s, i) => { if (s.no === null) s.no = i + 1; });
    return out.sort((a, b) => a.no - b.no);
  },
  norm: (sid) => String(sid || "").replace(/\D/g, "").replace(/^0+/, ""),
};

/**
 * รวมทุกอย่างของการสอบ 1 ชุด
 * → { students: [...], sheets: [...], problems: [...], counts }
 */
function summarizeExam(exam, sheets, classes, rules) {
  const pages = exam.pages || 1;
  const fullMax = (set) => (exam.keys?.[set] || []).slice(0, pages * ROWS).filter(Boolean).length;

  const roster = [];
  for (const cls of classes) for (const s of cls.students || []) roster.push({ ...s, room: cls.name, classId: cls.id });
  const byId = new Map(roster.map((s) => [Roster.norm(s.sid), s]));

  const rows = new Map(); // key → student row
  const studentRow = (s) => {
    const k = s.classId ? `${s.classId}:${s.sid}` : `x:${s.sid}`;
    if (!rows.has(k)) rows.set(k, { ...s, sheets: [], byPage: {}, score: 0, max: 0, lowCells: 0, set: null });
    return rows.get(k);
  };
  roster.forEach(studentRow);

  const sheetInfos = sheets.map((sh) => {
    const sid = sh.studentId ?? sh.result?.student_id ?? "";
    const info = { sheet: sh, sid, student: null, grade: null, issues: [] };
    if (sheetPending(sh)) { info.pending = true; return info; }
    if (sh.error) { info.issues.push({ kind: "error", text: sh.error }); return info; }
    info.grade = Grade.sheet(sh, exam, rules);
    if (info.grade.page > pages) info.issues.push({ kind: "page", text: `อ่านได้หน้า ${info.grade.page} แต่การสอบมี ${pages} หน้า` });
    if (!sid) info.issues.push({ kind: "id", text: "อ่านรหัสนักเรียนไม่ได้" });
    else if (roster.length) {
      const st = byId.get(Roster.norm(sid));
      if (st) info.student = st;
      else info.issues.push({ kind: "id", text: `ไม่พบรหัส ${sid} ในรายชื่อ` });
    } else info.student = { sid, name: "", no: null, room: "" };
    const hdr = sh.result?.header?.student_id;
    if (hdr?.review && !sh.studentId) info.issues.push({ kind: "idconf", text: "รหัสนักเรียนอ่านได้ไม่มั่นใจ" });
    return info;
  });

  for (const info of sheetInfos) {
    if (!info.student) continue;
    const r = studentRow(info.student);
    r.sheets.push(info);
    (r.byPage[info.grade.page] ||= []).push(info);
  }

  for (const r of rows.values()) {
    for (const [page, list] of Object.entries(r.byPage)) {
      if (list.length > 1) list.forEach((i) => i.issues.push({ kind: "dup", text: `${r.name || r.sid} มี ${list.length} แผ่นสำหรับหน้า ${page}` }));
    }
    const counted = Object.values(r.byPage).map((l) => l[l.length - 1]); // ใช้แผ่นล่าสุดของแต่ละหน้า
    r.set = counted[0]?.grade.set ?? null;
    r.score = counted.reduce((s, i) => s + i.grade.score, 0);
    r.max = r.set ? fullMax(r.set) : fullMax(1);
    r.lowCells = counted.reduce((s, i) => s + i.grade.lowCells, 0);
    r.missingPages = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => !r.byPage[p]);
    r.status = !r.sheets.length ? "absent" : r.missingPages.length ? "partial" : r.lowCells ? "review" : "done";
  }

  const students = [...rows.values()].sort((a, b) =>
    String(a.room).localeCompare(String(b.room), "th") || (a.no ?? 1e9) - (b.no ?? 1e9) || String(a.sid).localeCompare(String(b.sid))
  );
  const problems = sheetInfos.filter((i) => i.issues.length);
  const graded = students.filter((s) => s.sheets.length && s.max);
  return {
    students,
    sheets: sheetInfos,
    problems,
    counts: {
      roster: roster.length,
      scanned: sheets.length,
      pending: sheetInfos.filter((i) => i.pending).length,
      submitted: students.filter((s) => s.sheets.length).length,
      absent: students.filter((s) => s.status === "absent").length,
      reviewCells: sheetInfos.reduce((s, i) => s + (i.grade?.lowCells || 0), 0),
      problems: problems.length,
      done: students.filter((s) => s.status === "done").length,
      graded: graded.length,
    },
    fullMax,
  };
}

const STUDENT_STATUS = {
  absent: { text: "ยังไม่มีกระดาษ", cls: "muted" },
  partial: { text: "ขาดบางหน้า", cls: "warn" },
  review: { text: "รอตรวจ/แก้", cls: "warn" },
  done: { text: "เรียบร้อย", cls: "done" },
};

// ---------- ระบบโรงเรียนไทย ----------
const EXAM_KINDS = { quiz: "คะแนนเก็บ", midterm: "สอบกลางภาค", final: "สอบปลายภาค" };
const GRADE_LEVELS = ["ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6", "ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"];

// คะแนนดิบ → คะแนนที่บันทึกจริง (เช่น 17/20 ข้อ คิดเป็นคะแนนเก็บเต็ม 10 → 8.5) ปัดทศนิยม 1 ตำแหน่ง
function recordedScore(score, max, weight) {
  if (!weight || !max) return null;
  return Math.round((score / max) * weight * 10) / 10;
}

const termLabel = (o) => (o?.term && o?.year ? `ภาคเรียนที่ ${o.term}/${o.year}` : "");

// ---------- ส่งข้อมูลระหว่างฝ่ายวิชาการ ↔ ครู (ผ่านไฟล์ — ยังไม่มี server) ----------
const Transfer = {
  // ฝ่ายวิชาการ → ครู: ห้อง/รายชื่อ, รายวิชา, ข้อสอบกลาง, เกณฑ์ตรวจ
  async schoolPackage(forTeacherId) {
    const s = Settings.get();
    const subjects = await Store.all("subjects");
    const mySubjects = forTeacherId ? subjects.filter((x) => (x.teacherIds || []).includes(forTeacherId)) : subjects;
    const exams = (await Store.all("exams")).filter((e) => e.central && (!forTeacherId || mySubjects.some((x) => x.id === e.subjectId)));
    const teacher = forTeacherId ? await Store.get("teachers", forTeacherId) : null;
    return {
      app: "examer", type: "school-package", version: 1, createdAt: new Date().toISOString(),
      school: { name: s.schoolName, year: s.year, term: s.term },
      rules: { lowConf: s.lowConf, lowercase: s.lowercase, gap: s.gap, start: s.start, partial: s.partial },
      teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
      classes: await Store.all("classes"), subjects: mySubjects, exams,
    };
  },

  async importPackage(d) {
    if (d.app !== "examer" || d.type !== "school-package") throw new Error("ไม่ใช่ไฟล์ข้อมูลจากฝ่ายวิชาการ");
    for (const c of d.classes || []) await Store.put("classes", c);
    for (const x of d.subjects || []) await Store.put("subjects", x);
    for (const e of d.exams || []) {
      const old = await Store.get("exams", e.id);
      await Store.put("exams", { ...e, ...(old ? { sentAt: old.sentAt } : {}) }); // ข้อสอบกลาง: เฉลยจากโรงเรียน
    }
    const patch = { schoolName: d.school?.name || "", year: d.school?.year || Settings.get().year, term: d.school?.term || Settings.get().term, ...(d.rules || {}), rulesFromSchool: !!d.rules };
    if (d.teacher?.name && !Settings.get().teacherName) patch.teacherName = d.teacher.name;
    Settings.set(patch);
    return { classes: (d.classes || []).length, subjects: (d.subjects || []).length, exams: (d.exams || []).length };
  },

  // ครู → ฝ่ายวิชาการ: คะแนนรายคนของการสอบ 1 ชุด
  resultsFile(ctx) {
    const { exam, classes, sum } = ctx;
    const s = Settings.get();
    return {
      app: "examer", type: "results", version: 1, sentAt: new Date().toISOString(),
      teacher: s.teacherName, school: s.schoolName,
      exam: { id: exam.id, name: exam.name, subjectId: exam.subjectId || null, subject: exam.subject, subjectCode: exam.subjectCode,
        grade: exam.grade || "", kind: exam.kind, weight: exam.weight || null, year: exam.year, term: exam.term, date: exam.date,
        rooms: classes.map((c) => c.name), classIds: exam.classIds || [], central: !!exam.central },
      students: sum.students.map((x) => ({
        no: x.no, sid: x.sid, name: x.name, room: x.room, set: x.set,
        score: x.sheets.length ? x.score : null, max: x.max || null,
        recorded: x.sheets.length ? recordedScore(x.score, x.max, exam.weight) : null, status: x.status,
      })),
      pending: { problems: sum.counts.problems, reviewCells: sum.counts.reviewCells },
    };
  },

  async importResults(d) {
    if (d.app !== "examer" || d.type !== "results") throw new Error("ไม่ใช่ไฟล์ผลคะแนนจากครู");
    await Store.put("submissions", { id: d.exam.id, ...d, importedAt: Date.now() });
    return d;
  },
};

async function readJsonFile(file) {
  try {
    return JSON.parse(await file.text());
  } catch {
    throw new Error("เปิดไฟล์ไม่ได้ — ต้องเป็นไฟล์ .json จาก Examer");
  }
}
