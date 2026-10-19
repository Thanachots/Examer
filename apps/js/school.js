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
  review: { text: "รอตรวจทาน", cls: "warn" },
  done: { text: "เสร็จ", cls: "done" },
};
