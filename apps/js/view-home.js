// หน้าแรก — เลือกบทบาท (ครั้งแรก) · ครู: การสอบของฉัน · ฝ่ายวิชาการ: ภาพรวม (view-admin.js)

Views.home = async (root) => {
  const s = Settings.get();
  if (!s.role) return Views.welcome(root);
  if (s.role === "admin") return Views.adminHome(root);
  return Views.teacherHome(root);
};

// ================= ครั้งแรก: เลือกบทบาท =================
Views.welcome = async (root) => {
  root.innerHTML = `
    <div class="welcome">
      <section class="hero">
        <div class="hero-text">
          <h1><span class="nw">ตรวจกระดาษคำตอบ</span><span class="nw">ข้อเขียน</span> <span class="nw">ด้วยกล้องมือถือ</span></h1>
          <p class="lead">ถ่ายรูปกระดาษคำตอบ ระบบอ่านลายมือและให้คะแนนตามเฉลย ข้อไหนระบบอ่านไม่ชัด ครูเป็นคนตัดสินเอง</p>
          <h3 class="who-h">เริ่มใช้งานในฐานะ</h3>
          <div class="role-cards">
            <button class="role-card" data-role="teacher">
              <span class="role-ico">${ico("teacher")}</span>
              <span class="role-t"><b>ครูผู้สอน</b><span>ถ่ายรูปกระดาษ ตรวจ แก้ และส่งคะแนน</span></span>
              ${ico("next", "role-go")}
            </button>
            <button class="role-card" data-role="admin">
              <span class="role-ico">${ico("school")}</span>
              <span class="role-t"><b>ฝ่ายวิชาการ</b><span>รายชื่อนักเรียน รายวิชา ข้อสอบกลาง และผลทั้งโรงเรียน</span></span>
              ${ico("next", "role-go")}
            </button>
          </div>
          <form id="who" class="card form" hidden>
            <label id="who-name">ชื่อครู<input name="teacherName" placeholder="เช่น ครูสมศรี" /></label>
            <label>ชื่อโรงเรียน<input name="schoolName" placeholder="เช่น โรงเรียนตัวอย่างวิทยา" /></label>
            <div id="pkg" class="pkg" hidden>
              <p class="small"><b>มีไฟล์ข้อมูลจากฝ่ายวิชาการไหม</b><br /><span class="muted">ไฟล์นี้มีรายชื่อนักเรียน รายวิชา และข้อสอบกลาง ถ้ายังไม่มีก็ข้ามไปก่อนได้</span></p>
              <label class="ghost btn file-btn">เลือกไฟล์จากฝ่ายวิชาการ<input id="pkg-file" type="file" accept=".json,application/json" hidden /></label>
              <span id="pkg-msg" class="small muted"></span>
            </div>
            <div class="form-actions"><button class="primary big" type="submit">เริ่มใช้งาน</button></div>
          </form>
          <p class="demo-line"><button id="demo" class="link-btn">ลองดูด้วยข้อมูลตัวอย่างก่อน</button></p>
        </div>
        <figure class="hero-sheet" aria-label="ตัวอย่างกระดาษคำตอบที่ตรวจแล้ว">${sheetIllustration()}</figure>
      </section>
      <ul class="facts">
        <li>${ico("lock")}<div><b>รูปกระดาษไม่ออกจากเครื่อง</b><span>ระบบอ่านลายมือทำงานในเบราว์เซอร์ ไม่ได้ส่งรูปนักเรียนไปที่ไหน</span></div></li>
        <li>${ico("eye")}<div><b>ครูเห็นทุกจุดที่ระบบไม่แน่ใจ</b><span>แสดงลายมือจริงของช่องนั้นให้ดู แตะเลือกตัวที่ถูกได้ทันที</span></div></li>
        <li>${ico("table")}<div><b>คะแนนเรียงตามเลขที่</b><span>แปลงเป็นคะแนนเก็บ/กลางภาค/ปลายภาค พร้อมกรอก SGS หรือ ปพ.5</span></div></li>
      </ul>
    </div>`;

  let role = "";
  $$(".role-card").forEach((b) => (b.onclick = () => {
    role = b.dataset.role;
    $$(".role-card").forEach((x) => x.classList.toggle("active", x === b));
    $("#who").hidden = false;
    $("#who-name").hidden = role !== "teacher";
    $("#pkg").hidden = role !== "teacher";
    $("#who input:not([hidden])")?.focus();
  }));
  $("#pkg-file").onchange = async (e) => {
    try {
      const n = await Transfer.importPackage(await readJsonFile(e.target.files[0]));
      const st = Settings.get();
      $('[name="schoolName"]').value = st.schoolName;
      if (st.teacherName) $('[name="teacherName"]').value = st.teacherName;
      $("#pkg-msg").textContent = `✓ ได้ ${n.classes} ห้อง · ${n.subjects} วิชา · ${n.exams} ข้อสอบกลาง`;
    } catch (err) { $("#pkg-msg").textContent = err.message; }
  };
  $("#who").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    Settings.set({ role, teacherName: (fd.get("teacherName") || "").trim(), schoolName: (fd.get("schoolName") || "").trim() });
    renderNav();
    router();
  };
  $("#demo").onclick = async (e) => { e.target.disabled = true; e.target.textContent = "กำลังเตรียม…"; await createDemo(); renderNav(); location.hash = "#/"; router(); };
};

// ================= ครู: การสอบของฉัน =================
Views.teacherHome = async (root) => {
  const s = Settings.get();
  const exams = (await Store.all("exams")).sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.createdAt - a.createdAt);
  const ctxs = await Promise.all(exams.map((e) => loadExamContext(e.id)));
  const hasSchool = (await Store.all("classes")).length > 0;

  const row = ({ exam, classes, sum }) => {
    const c = sum.counts;
    const total = c.roster || c.submitted;
    const na = nextAction(exam, sum);
    const btn = na.tone === "primary" ? "primary" : na.tone === "warn" ? "warn-btn" : na.tone === "done" ? "ghost done-btn" : "ghost";
    return `<li class="exam-item">
      <a class="ei-main" href="#/exam/${exam.id}">
        <b class="ei-title">${esc(exam.name)}</b>
        <span class="ei-meta">
          <span class="kind kind-${esc(exam.kind || "quiz")}">${esc(EXAM_KINDS[exam.kind] || "การสอบ")}</span>
          ${exam.subjectCode ? `<span>${esc(exam.subjectCode)}</span>` : ""}
          <span>${esc(classes.map((x) => x.name).join(", ") || "ยังไม่เลือกห้อง")}</span>
          ${exam.date ? `<span>${esc(thaiDate(exam.date))}</span>` : ""}
        </span>
      </a>
      <div class="ei-progress">
        <span class="small">${total ? `ตรวจแล้ว <b>${c.submitted}</b> จาก ${total} คน` : "ยังไม่มีกระดาษ"}</span>
        <div class="bar"><i style="width:${pct(c.submitted, total || 1)}%"></i></div>
      </div>
      <a class="btn ${btn} ei-action" href="${na.href}">${esc(na.text)}</a>
    </li>`;
  };

  const central = ctxs.filter((x) => x.exam.central);
  const mine = ctxs.filter((x) => !x.exam.central);
  const todoFirst = (a, b) => (a.exam.sentAt ? 1 : 0) - (b.exam.sentAt ? 1 : 0);
  const list = (xs) => `<ul class="exam-list2">${xs.sort(todoFirst).map(row).join("")}</ul>`;

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h2>การสอบของฉัน</h2>
        <p class="muted">${esc([s.teacherName, termLabel(s)].filter(Boolean).join("  ·  "))}</p>
      </div>
      <a class="btn primary" href="#/exam/new">${ico("plus")}สร้างการสอบ</a>
    </div>
    ${hasSchool ? "" : `<div class="notice">ยังไม่มีรายชื่อนักเรียน ขอไฟล์ข้อมูลจากฝ่ายวิชาการแล้วนำเข้าที่ <a href="#/settings">ตั้งค่า</a> ถ้ายังไม่มี ระบบจะแสดงเลขประจำตัวแทนชื่อ</div>`}
    ${central.length ? `<h3 class="section-h">ข้อสอบกลางจากฝ่ายวิชาการ <span class="muted">${central.length}</span></h3>${list(central)}` : ""}
    ${mine.length ? `<h3 class="section-h">${central.length ? "การสอบที่ฉันสร้าง" : "การสอบ"} <span class="muted">${mine.length}</span></h3>${list(mine)}`
      : central.length ? "" : `<div class="empty-state">
          <div class="big-ico">${ico("sheet")}</div>
          <h3>ยังไม่มีการสอบ</h3>
          <p class="muted">สร้างการสอบ เลือกวิชาและห้อง ใส่เฉลย แล้วถ่ายรูปกระดาษคำตอบได้เลย</p>
          <a class="btn primary" href="#/exam/new">${ico("plus")}สร้างการสอบ</a>
        </div>`}`;
};

// ภาพประกอบหน้าแรก: กระดาษคำตอบ Template 2 ที่ครูตรวจด้วยปากกาแดง (วาดเส้นแดงตอนเปิดหน้า)
function sheetIllustration() {
  const rows = [["SCHOOL", 1], ["RIVER", 1], ["MONDAY", 1], ["GREEN", 0], ["APPLE", 1]];
  const cols = 8, x0 = 74, y0 = 128, w = 34, gap = 4, rh = 50;
  let cells = "", marks = "", k = 0;
  rows.forEach(([word, ok], r) => {
    const y = y0 + r * rh;
    cells += `<text x="${x0 - 18}" y="${y + 24}" class="hs-num">${r + 1}</text>`;
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * (w + gap);
      cells += `<rect x="${x}" y="${y}" width="${w}" height="${w}" class="hs-box"/>`;
      const ch = r === 3 && c === 2 ? "A" : word[c];
      if (ch) cells += `<text x="${x + w / 2}" y="${y + 26}" class="hs-hand" style="--r:${((r * 7 + c * 3) % 5) - 2}deg">${ch}</text>`;
    }
    const mx = x0 + cols * (w + gap) + 14, d = (0.5 + k++ * 0.28).toFixed(2);
    marks += ok
      ? `<path d="M${mx} ${y + 18} l7 9 l14 -20" class="hs-red" style="--d:${d}s"/>`
      : `<path d="M${mx} ${y + 6} l18 20 M${mx + 18} ${y + 6} l-18 20" class="hs-red" style="--d:${d}s"/>`;
  });
  // ช่องที่ครูแก้: วงกลมรอบตัวที่อ่านผิด
  marks += `<ellipse cx="${x0 + 2 * (w + gap) + w / 2}" cy="${y0 + 3 * rh + w / 2}" rx="24" ry="22" class="hs-red" style="--d:1.9s"/>`;
  const id = "2430" + "1";
  const idBoxes = [...id].map((n, i) => `<rect x="${250 + i * 26}" y="74" width="22" height="28" class="hs-box"/><text x="${261 + i * 26}" y="95" class="hs-hand">${n}</text>`).join("");
  return `<svg class="sheet-svg" viewBox="0 0 440 420" role="img">
    <rect x="10" y="10" width="420" height="400" rx="6" class="hs-paper"/>
    <text x="34" y="46" class="hs-label">กระดาษคำตอบ</text>
    <line x1="34" y1="58" x2="406" y2="58" class="hs-rule"/>
    <text x="34" y="96" class="hs-small">ชื่อ</text><path d="M62 98 h120" class="hs-rule"/><text x="70" y="94" class="hs-hand hs-name">ด.ญ.ณิชา</text>
    <text x="244" y="96" class="hs-small" text-anchor="end">เลขประจำตัว</text>${idBoxes}
    ${cells}
    <g class="hs-score"><ellipse cx="364" cy="38" rx="44" ry="24" class="hs-red" style="--d:2.3s"/><text x="364" y="48" class="hs-red-text">17/20</text></g>
    ${marks}
  </svg>`;
}

function thaiDate(iso) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

// ================= ข้อมูลตัวอย่าง =================
// โรงเรียนตัวอย่าง: ม.3/1, ม.3/2 · วิชาภาษาอังกฤษ · ข้อสอบกลาง (กลางภาค) + การสอบย่อยของครู · กระดาษจำลอง
async function createDemo() {
  const first = ["กันต์", "ณิชา", "ธนพล", "ปุณยวีร์", "ภูมิ", "มินตรา", "รวิช", "ศิรดา", "อชิตะ", "ชนัญญา", "ปัณณ์", "พิชญา", "วรเมธ", "สุพิชญา", "ธีรภัทร"];
  const last = ["ใจดี", "สุขสม", "ทองคำ", "แสงทอง", "มีสุข", "ศรีงาม", "บุญมา", "รักเรียน", "พูนผล", "ดีงาม", "เพียรดี", "สายใจ", "แก้วใส", "ชื่นใจ", "มั่นคง"];
  const mk = (base) => first.map((f, i) => ({ no: i + 1, sid: String(base + i), name: `${i % 2 ? "ด.ญ." : "ด.ช."} ${f} ${last[(i + base) % last.length]}` }));
  const s = Settings.get();
  Settings.set({ role: s.role || "teacher", teacherName: s.teacherName || "ครูสมศรี (ตัวอย่าง)", schoolName: s.schoolName || "โรงเรียนตัวอย่างวิทยา" });
  const c1 = await Store.put("classes", { id: uid(), name: "ม.3/1", year: s.year, students: mk(24201), createdAt: Date.now() });
  const c2 = await Store.put("classes", { id: uid(), name: "ม.3/2", year: s.year, students: mk(24301), createdAt: Date.now() });
  const t1 = await Store.put("teachers", { id: uid(), name: "ครูสมศรี (ตัวอย่าง)", email: "somsri@example.com" });
  const t2 = await Store.put("teachers", { id: uid(), name: "ครูวิชัย (ตัวอย่าง)", email: "wichai@example.com" });
  const sub = await Store.put("subjects", { id: uid(), code: "อ23101", name: "ภาษาอังกฤษ 5", grade: "ม.3", teacherIds: [t1.id, t2.id] });
  const today = new Date().toISOString().slice(0, 10);
  const base = { subjectId: sub.id, subject: sub.name, subjectCode: sub.code, grade: "ม.3", year: s.year, term: s.term, pages: 1, createdAt: Date.now() };
  await Store.put("exams", { ...base, id: uid(), name: "สอบกลางภาค ภาษาอังกฤษ 5 (ตัวอย่าง)", kind: "midterm", weight: 20, central: true,
    classIds: [c1.id, c2.id], date: today, keys: { 1: [...DEMO_KEY], 2: [...DEMO_KEY].reverse(), 3: [] }, createdBy: "admin" });
  const quiz = await Store.put("exams", { ...base, id: uid(), name: "คะแนนเก็บ คำศัพท์บทที่ 3 (ตัวอย่าง)", kind: "quiz", weight: 10, central: false,
    classIds: [c2.id], date: today, keys: { 1: [...DEMO_KEY], 2: [], 3: [] }, createdBy: t1.name });
  const ids = c2.students.map((x) => x.sid).filter((_, i) => ![4, 9, 13].includes(i));
  ids.push("24399");
  let i = 0;
  for (const sid of ids) {
    const { blob, result } = await Pipeline.demoSheet(quiz, { studentId: sid, page: 1 });
    await Store.put("sheets", { id: uid(), examId: quiz.id, fileName: `photo_${String(++i).padStart(3, "0")}.jpg`, createdAt: Date.now() + i, image: blob, result, status: "done" });
  }
  // ผลที่ "ครูอีกคน" ส่งมาแล้ว (ให้หน้าภาพรวมของฝ่ายวิชาการมีข้อมูล)
  await Store.put("submissions", {
    id: uid(), app: "examer", type: "results", sentAt: new Date().toISOString(), teacher: t2.name, school: Settings.get().schoolName,
    exam: { name: "คะแนนเก็บ Reading บทที่ 2 (ตัวอย่าง)", subjectId: sub.id, subject: sub.name, subjectCode: sub.code, grade: "ม.3", kind: "quiz", weight: 10, year: s.year, term: s.term, rooms: ["ม.3/1"], classIds: [c1.id] },
    students: c1.students.map((x, k) => ({ ...x, room: "ม.3/1", score: k === 6 ? null : 10 + ((k * 7) % 10), max: 20, recorded: k === 6 ? null : (10 + ((k * 7) % 10)) / 2, status: k === 6 ? "absent" : "done" })),
    importedAt: Date.now(),
  });
  return quiz.id;
}
