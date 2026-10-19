// หน้าแรก — การสอบทั้งหมด + งานที่ค้าง

Views.home = async (root) => {
  const s = Settings.get();
  const exams = (await Store.all("exams")).sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.createdAt - a.createdAt);
  const classes = await Store.all("classes");
  const ctxs = await Promise.all(exams.map((e) => loadExamContext(e.id)));

  const todo = [];
  ctxs.forEach(({ exam, sum }) => {
    const link = (step) => `#/exam/${exam.id}/${step}`;
    if (!SETS.some((n) => (exam.keys?.[n] || []).some(Boolean))) todo.push({ href: link("setup"), exam, text: "ยังไม่ได้ใส่เฉลย", cls: "warn" });
    if (sum.counts.problems) todo.push({ href: link("review"), exam, text: `กระดาษมีปัญหา ${sum.counts.problems} แผ่น`, cls: "bad" });
    if (sum.counts.reviewCells) todo.push({ href: link("review"), exam, text: `รอตรวจทาน ${sum.counts.reviewCells} ช่อง`, cls: "warn" });
  });

  const row = ({ exam, classes: cls, sum }) => {
    const c = sum.counts;
    const total = c.roster || c.submitted;
    const status = !c.scanned ? pill("muted", "ยังไม่สแกน") : c.problems || c.reviewCells ? pill("warn", "กำลังตรวจ") : c.absent ? pill("warn", `ขาด ${c.absent} คน`) : pill("done", "ตรวจครบ");
    return `<a class="exam-row" href="#/exam/${exam.id}">
      <div class="er-main">
        <b>${esc(exam.name)}</b>
        <span class="muted small">${esc([exam.subjectCode, exam.subject].filter(Boolean).join(" "))}${cls.length ? " · " + esc(cls.map((x) => x.name).join(", ")) : ""}${exam.date ? " · " + esc(thaiDate(exam.date)) : ""}</span>
      </div>
      <div class="er-progress" title="ส่งแล้ว ${c.submitted} จาก ${total} คน">
        <div class="bar"><i style="width:${pct(c.submitted, total || 1)}%"></i></div>
        <span class="mono small">${c.submitted}/${total || "–"}</span>
      </div>
      <div class="er-status">${status}</div>
    </a>`;
  };

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h2>${s.teacher ? `สวัสดีครับ/ค่ะ ครู${esc(s.teacher)}` : "การสอบ"}</h2>
        <p class="muted">${esc(s.school || "ตรวจกระดาษคำตอบข้อเขียน Template 2")}</p>
      </div>
      <div class="row">
        ${exams.length ? "" : `<button id="demo" class="ghost">ลองด้วยข้อมูลตัวอย่าง</button>`}
        <a class="btn primary" href="#/exam/new">+ สร้างการสอบ</a>
      </div>
    </div>

    ${todo.length ? `<section class="card todo">
      <h3>งานที่ค้างอยู่</h3>
      ${todo.map((t) => `<a class="todo-item" href="${t.href}"><span class="dot ${t.cls}"></span><span><b>${esc(t.exam.name)}</b> — ${esc(t.text)}</span><span class="muted">→</span></a>`).join("")}
    </section>` : ""}

    ${exams.length ? `<section class="card flush"><div class="exam-list">${ctxs.map(row).join("")}</div></section>`
      : `<section class="card onboarding">
          <h3>เริ่มใช้งานใน 3 ขั้น</h3>
          <ol class="steps-intro">
            <li><b>เพิ่มห้องเรียน</b><span>วางรายชื่อนักเรียนจาก Excel (เลขที่ · เลขประจำตัว · ชื่อ)</span><a href="#/classes">ไปที่ห้องเรียน →</a></li>
            <li><b>สร้างการสอบ แล้วใส่เฉลย</b><span>เลือกห้องที่สอบ และจำนวนหน้ากระดาษคำตอบ</span><a href="#/exam/new">สร้างการสอบ →</a></li>
            <li><b>สแกนกระดาษคำตอบ</b><span>ถ่ายด้วยมือถือ หรืออัปโหลดไฟล์สแกนทีละหลายแผ่น ระบบจับคู่กับรายชื่อจากรหัสนักเรียนให้เอง</span></li>
          </ol>
          ${classes.length ? "" : `<p class="muted small">อยากเห็นภาพรวมก่อน? กด “ลองด้วยข้อมูลตัวอย่าง” ด้านบน</p>`}
        </section>`}`;

  const demo = $("#demo");
  if (demo) demo.onclick = async () => { demo.disabled = true; demo.textContent = "กำลังสร้าง…"; location.hash = `#/exam/${await createDemo()}/review`; };
};

function thaiDate(iso) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

// ข้อมูลตัวอย่าง: ห้อง ม.3/2 15 คน, การสอบ 1 ชุด, กระดาษ 13 แผ่น (ขาด 3 คน, รหัสผิด 1 แผ่น)
async function createDemo() {
  const first = ["กันต์", "ณิชา", "ธนพล", "ปุณยวีร์", "ภูมิ", "มินตรา", "รวิช", "ศิรดา", "อชิตะ", "ชนัญญา", "ปัณณ์", "พิชญา", "วรเมธ", "สุพิชญา", "ธีรภัทร"];
  const last = ["ใจดี", "สุขสม", "ทองคำ", "แสงทอง", "มีสุข", "ศรีงาม", "บุญมา", "รักเรียน", "พูนผล", "ดีงาม", "เพียรดี", "สายใจ", "แก้วใส", "ชื่นใจ", "มั่นคง"];
  const students = first.map((f, i) => ({ no: i + 1, sid: String(24301 + i), name: `${i % 2 ? "ด.ญ." : "ด.ช."} ${f} ${last[i]}` }));
  const cls = await Store.put("classes", { id: uid(), name: "ม.3/2 (ตัวอย่าง)", year: "2569", students, createdAt: Date.now() });
  const exam = await Store.put("exams", {
    id: uid(), name: "ทดสอบคำศัพท์ บทที่ 3 (ตัวอย่าง)", subject: "ภาษาอังกฤษ", subjectCode: "อ23101",
    year: "2569", term: "2", date: new Date().toISOString().slice(0, 10), pages: 1, classIds: [cls.id],
    keys: { 1: [...DEMO_KEY], 2: [...DEMO_KEY].reverse(), 3: [] }, createdAt: Date.now(),
  });
  const ids = students.map((s) => s.sid).filter((_, i) => ![4, 9, 13].includes(i));
  ids.push("24399"); // รหัสที่ไม่มีในรายชื่อ
  let i = 0;
  for (const sid of ids) {
    const { blob, result } = await Pipeline.demoSheet(exam, { studentId: sid, page: 1 });
    await Store.put("sheets", { id: uid(), examId: exam.id, fileName: `scan_${String(++i).padStart(3, "0")}.jpg`, createdAt: Date.now() + i, image: blob, result });
  }
  return exam.id;
}
