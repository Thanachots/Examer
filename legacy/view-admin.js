// ฝ่ายวิชาการ — ภาพรวมทั้งโรงเรียน · รายวิชาและครู · ข้อสอบกลาง · ผลที่ครูส่งมา
// ยังไม่มี server: ครูส่งไฟล์ผลคะแนนมา → นำเข้าที่นี่ · ฝ่ายวิชาการส่งไฟล์ข้อมูล (รายชื่อ/วิชา/ข้อสอบกลาง) ให้ครู

const sortTh = (a, b) => String(a).localeCompare(String(b), "th");

// ================= ภาพรวม =================
Views.adminHome = async (root) => {
  const s = Settings.get();
  const subs = await Store.all("submissions");
  const central = (await Store.all("exams")).filter((e) => e.central);
  const classes = await Store.all("classes");
  const roomName = (id) => classes.find((c) => c.id === id)?.name || "";

  const rows = subs.map((d) => {
    const st = d.students || [];
    const scored = st.filter((x) => x.score != null && x.max);
    const mean = scored.length ? scored.reduce((a, x) => a + x.score / x.max, 0) / scored.length * 100 : null;
    return { id: d.id, href: `#/result/${d.id}`, name: d.exam.name, code: d.exam.subjectCode, grade: d.exam.grade, kind: d.exam.kind,
      rooms: (d.exam.rooms || []).join(", "), teacher: d.teacher, n: scored.length, total: st.length,
      absent: st.filter((x) => x.status === "absent").length, mean, sentAt: d.sentAt, done: true };
  });
  for (const e of central) {
    if (subs.some((d) => d.id === e.id)) continue;
    rows.push({ id: e.id, href: `#/exam/${e.id}/edit`, name: e.name, code: e.subjectCode, grade: e.grade, kind: e.kind,
      rooms: (e.classIds || []).map(roomName).join(", "), teacher: "", n: 0, total: 0, absent: 0, mean: null, sentAt: null, done: false });
  }
  const grades = [...new Set(rows.map((r) => r.grade).filter(Boolean))].sort(sortTh);
  let grade = "";

  root.innerHTML = `
    <div class="page-head">
      <div><h2>ภาพรวมการสอบ</h2><p class="muted">${esc([s.schoolName, termLabel(s)].filter(Boolean).join(" · "))}</p></div>
      <label class="btn primary file-btn">นำเข้าไฟล์คะแนนจากครู<input id="imp" type="file" accept=".json,application/json" multiple hidden /></label>
    </div>
    <div id="tiles"></div>
    <div class="row toolbar">
      ${grades.length > 1 ? `<select id="grade" aria-label="ระดับชั้น"><option value="">ทุกระดับชั้น</option>${grades.map((g) => `<option>${esc(g)}</option>`).join("")}</select>` : ""}
      <span class="spacer"></span>
      <a class="btn ghost" href="#/central/new">+ ข้อสอบกลาง</a>
    </div>
    <section class="card flush"><div id="list"></div></section>
    <details class="card how"><summary><b>ครูส่งคะแนนมาอย่างไร</b></summary>
      <ol class="small">
        <li>ครูกด <b>คะแนน › สร้างไฟล์ส่งคะแนน</b> ในแอปของครู แล้วส่งไฟล์ .json มาทางไลน์/อีเมล</li>
        <li>ฝ่ายวิชาการกด <b>นำเข้าไฟล์คะแนนจากครู</b> (เลือกหลายไฟล์พร้อมกันได้)</li>
        <li>ถ้าครูแก้คะแนนแล้วส่งใหม่ นำเข้าไฟล์ใหม่ได้เลย — แทนที่ของเดิมให้เอง</li>
      </ol>
      <p class="muted small">ต้นแบบนี้ยังไม่มี server จึงส่งกันผ่านไฟล์ · ถ้ามี server จะเชิญครูทางอีเมลและเห็นผลทันทีโดยไม่ต้องส่งไฟล์</p>
    </details>`;

  const render = () => {
    const list = rows.filter((r) => !grade || r.grade === grade).sort((a, b) => (a.done - b.done) || sortTh(a.code || "", b.code || ""));
    const done = list.filter((r) => r.done);
    $("#tiles").innerHTML = `<div class="stats">
      <div class="stat"><b>${list.length}</b><span>การสอบ</span></div>
      <div class="stat"><b>${done.length}</b><span>ได้รับคะแนนแล้ว</span></div>
      <div class="stat"><b>${list.length - done.length}</b><span>รอครูส่งคะแนน</span></div>
      <div class="stat"><b>${done.reduce((a, r) => a + r.absent, 0)}</b><span>นักเรียนที่ยังไม่มีคะแนน</span></div>
    </div>`;
    $("#list").innerHTML = list.length ? `<table class="table">
      <thead><tr><th>วิชา / การสอบ</th><th class="hide-sm">ห้อง</th><th class="hide-sm">ครู</th><th>มีคะแนน</th><th>เฉลี่ย</th><th>สถานะ</th></tr></thead>
      <tbody>${list.map((r) => `<tr data-href="${r.href}">
        <td><b>${esc(r.code || "")}</b> ${esc(r.name)}<br /><span class="muted small">${esc(EXAM_KINDS[r.kind] || "")}</span></td>
        <td class="hide-sm">${esc(r.rooms)}</td><td class="hide-sm">${esc(r.teacher || "—")}</td>
        <td class="mono">${r.done ? `${r.n}/${r.total}` : "–"}</td>
        <td class="mono">${r.mean != null ? Math.round(r.mean) + "%" : "–"}</td>
        <td>${r.done ? pill("done", "ได้รับแล้ว " + new Date(r.sentAt).toLocaleDateString("th-TH", { day: "numeric", month: "short" })) : pill("warn", "รอครูส่ง")}</td>
      </tr>`).join("")}</tbody></table>`
      : `<div class="empty-state"><div class="big-ico">${ico("school")}</div><h3>ยังไม่มีการสอบ</h3>
          <p class="muted">เริ่มจาก <a href="#/classes">ห้องเรียน</a> → <a href="#/subjects">รายวิชาและครู</a> → ส่งไฟล์ข้อมูลให้ครู · หรือสร้าง <a href="#/central/new">ข้อสอบกลาง</a></p></div>`;
    $$("#list tr[data-href]").forEach((tr) => (tr.onclick = () => (location.hash = tr.dataset.href)));
  };
  render();
  const gs = $("#grade");
  if (gs) gs.onchange = () => { grade = gs.value; render(); };

  $("#imp").onchange = async (e) => {
    let ok = 0;
    const errs = [];
    for (const f of e.target.files) {
      try { await Transfer.importResults(await readJsonFile(f)); ok++; } catch (err) { errs.push(`${f.name}: ${err.message}`); }
    }
    toast(ok ? `นำเข้า ${ok} ไฟล์แล้ว` : errs[0] || "ไม่ได้นำเข้า");
    router();
  };
};

// ================= ผลที่ครูส่งมา (1 การสอบ) =================
Views.result = async (root, id) => {
  const d = await Store.get("submissions", id);
  if (!d) return (root.innerHTML = `<div class="empty-state"><h3>ไม่พบผล</h3><a href="#/">กลับ</a></div>`);
  const w = d.exam.weight;
  const st = [...(d.students || [])].sort((a, b) => sortTh(a.room || "", b.room || "") || (a.no ?? 1e9) - (b.no ?? 1e9));
  root.innerHTML = `
    <div class="page-head">
      <div><a class="back" href="#/">${ico("back")}ภาพรวม</a><h2>${esc(d.exam.name)}</h2>
        <p class="muted">${esc([d.exam.subjectCode, (d.exam.rooms || []).join(", "), EXAM_KINDS[d.exam.kind], d.teacher ? "ครู" + d.teacher.replace(/^ครู/, "") : ""].filter(Boolean).join(" · "))}</p>
        <p class="muted small">ส่งเมื่อ ${esc(new Date(d.sentAt).toLocaleString("th-TH"))}${d.pending?.problems || d.pending?.reviewCells ? ` · <span class="bad-text">ตอนส่งยังมี ${d.pending.problems + d.pending.reviewCells} จุดที่ครูยังไม่ได้แก้</span>` : ""}</p></div>
      <div class="row"><button id="sgs" class="ghost">ไฟล์คะแนน (Excel)</button><button id="print" class="ghost">พิมพ์</button></div>
    </div>
    <section class="card flush print-area">
      <div class="print-only print-head"><b>${esc(d.school || Settings.get().schoolName)}</b><br /><b>${esc(d.exam.name)}</b> — ${esc((d.exam.rooms || []).join(", "))} · ${esc(termLabel(d.exam))}</div>
      <table class="table score-table"><thead><tr><th>ห้อง</th><th>เลขที่</th><th class="hide-sm">เลขประจำตัว</th><th>ชื่อ-สกุล</th><th>ข้อที่ถูก</th>${w ? `<th>คะแนน (เต็ม ${fmt(w)})</th>` : ""}<th class="no-print">สถานะ</th></tr></thead>
      <tbody>${st.map((x) => `<tr class="${x.status === "absent" ? "absent" : ""}"><td>${esc(x.room)}</td><td>${x.no ?? ""}</td><td class="mono hide-sm">${esc(x.sid)}</td><td>${esc(x.name)}</td>
        <td class="mono">${x.score != null ? `${fmt(x.score)}/${x.max}` : "–"}</td>${w ? `<td class="mono"><b>${x.recorded != null ? fmt(x.recorded) : "–"}</b></td>` : ""}
        <td class="no-print">${pill((STUDENT_STATUS[x.status] || STUDENT_STATUS.done).cls, (STUDENT_STATUS[x.status] || STUDENT_STATUS.done).text)}</td></tr>`).join("")}</tbody></table>
    </section>
    <div class="row"><span class="spacer"></span><button id="del" class="ghost danger">ลบผลนี้</button></div>`;
  $("#print").onclick = () => window.print();
  $("#sgs").onclick = () => {
    const lines = [csvRow(["ห้อง", "เลขที่", "เลขประจำตัว", "ชื่อ-สกุล", w ? `คะแนน (เต็ม ${w})` : "คะแนน", "หมายเหตุ"])];
    st.forEach((x) => lines.push(csvRow([x.room, x.no ?? "", x.sid, x.name, x.score == null ? "" : fmt(w ? x.recorded : x.score), x.status === "absent" ? "ขาดสอบ/ยังไม่ส่ง" : ""])));
    download(`${[d.exam.subjectCode, d.exam.name].filter(Boolean).join("_").replace(/[\\/:*?"<>|]/g, "")}.csv`, "﻿" + lines.join("\r\n"), "text/csv");
  };
  armButton($("#del"), "กดอีกครั้งเพื่อลบ", async () => { await Store.del("submissions", id); location.hash = "#/"; });
};

// ================= ข้อสอบกลาง =================
Views.central = async (root) => {
  const exams = (await Store.all("exams")).filter((e) => e.central).sort((a, b) => sortTh(a.subjectCode || "", b.subjectCode || ""));
  const classes = await Store.all("classes");
  root.innerHTML = `
    <div class="page-head">
      <div><h2>ข้อสอบกลาง</h2><p class="muted">ฝ่ายวิชาการตั้งเฉลยครั้งเดียว ครูทุกห้องใช้เฉลยเดียวกัน — ส่งไปพร้อมไฟล์ข้อมูลให้ครู</p></div>
      <a class="btn primary big" href="#/central/new">+ ข้อสอบกลาง</a>
    </div>
    ${exams.length ? `<section class="card flush"><table class="table"><thead><tr><th>วิชา</th><th>การสอบ</th><th class="hide-sm">ห้อง</th><th>เฉลย</th></tr></thead><tbody>
      ${exams.map((e) => `<tr data-href="#/exam/${e.id}/edit"><td><b>${esc(e.subjectCode || "")}</b> ${esc(e.subject || "")}</td><td>${esc(e.name)}<br /><span class="muted small">${esc(EXAM_KINDS[e.kind] || "")}${e.weight ? ` · เต็ม ${fmt(e.weight)}` : ""}</span></td>
        <td class="hide-sm">${esc((e.classIds || []).map((id) => classes.find((c) => c.id === id)?.name).filter(Boolean).join(", "))}</td>
        <td>${hasAnyKey(e) ? pill("done", SETS.filter((n) => (e.keys?.[n] || []).some(Boolean)).length + " ชุด") : pill("warn", "ยังไม่มี")}</td></tr>`).join("")}
    </tbody></table></section>
    <p class="muted small">สร้าง/แก้ข้อสอบกลางแล้ว ต้องส่ง <a href="#/subjects">ไฟล์ข้อมูลให้ครู</a> ใหม่ ครูถึงจะได้เฉลยล่าสุด</p>`
    : `<div class="empty-state"><div class="big-ico">${ico("sheet")}</div><h3>ยังไม่มีข้อสอบกลาง</h3><p class="muted">เช่น สอบกลางภาค/ปลายภาค ที่ทุกห้องในระดับชั้นใช้ข้อสอบเดียวกัน</p></div>`}`;
  $$("tr[data-href]").forEach((tr) => (tr.onclick = () => (location.hash = tr.dataset.href)));
};

Views.centralNew = async (root) => {
  const s = Settings.get();
  const exam = { name: "", kind: "midterm", classIds: [], pages: 1, keys: { 1: [], 2: [], 3: [] }, date: "", year: s.year, term: s.term, central: true };
  await renderExamForm(root, exam, { title: "ข้อสอบกลาง", back: "#/central", central: true, onSaved: () => (location.hash = "#/central") });
};

// ================= รายวิชาและครู =================
Views.subjects = async (root) => {
  const subjects = (await Store.all("subjects")).sort((a, b) => sortTh(a.code, b.code));
  const teachers = (await Store.all("teachers")).sort((a, b) => sortTh(a.name, b.name));
  const s = Settings.get();

  root.innerHTML = `
    <div class="page-head"><div><h2>รายวิชาและครู</h2><p class="muted">กำหนดว่าครูคนไหนสอนวิชาอะไร แล้วส่งไฟล์ข้อมูลให้ครูแต่ละคน</p></div></div>

    <section class="card">
      <h3>ครู</h3>
      ${teachers.length ? `<table class="table compact"><thead><tr><th>ชื่อ</th><th class="hide-sm">อีเมล</th><th>วิชาที่สอน</th><th></th></tr></thead><tbody>
        ${teachers.map((t) => `<tr>
          <td>${esc(t.name)}</td><td class="hide-sm">${esc(t.email || "")}</td>
          <td class="small">${esc(subjects.filter((x) => (x.teacherIds || []).includes(t.id)).map((x) => x.code).join(", ") || "—")}</td>
          <td class="actions"><button class="ghost small" data-pkg="${t.id}">ไฟล์สำหรับครู</button>
            ${t.email ? `<a class="ghost small btn" href="mailto:${encodeURIComponent(t.email)}?subject=${encodeURIComponent("Examer: ไฟล์ข้อมูลรายวิชา " + (s.schoolName || ""))}&body=${encodeURIComponent(`เรียน ${t.name}\n\nแนบไฟล์ข้อมูลสำหรับแอป Examer (รายชื่อนักเรียน รายวิชา และข้อสอบกลาง)\nเปิดแอป › ตั้งค่า › นำเข้าข้อมูลจากฝ่ายวิชาการ แล้วเลือกไฟล์ที่แนบมา\n\nฝ่ายวิชาการ ${s.schoolName || ""}`)}">อีเมล</a>` : ""}
            <button class="icon" data-del-t="${t.id}" aria-label="ลบ">${ico("x")}</button></td>
        </tr>`).join("")}</tbody></table>` : `<p class="muted">ยังไม่มีครู</p>`}
      <form id="tf" class="inline-form">
        <input name="name" placeholder="ชื่อครู" required />
        <input name="email" type="email" placeholder="อีเมล (ไม่บังคับ)" />
        <button class="ghost">+ เพิ่มครู</button>
      </form>
      <p class="muted small">“ไฟล์สำหรับครู” = รายชื่อนักเรียน + วิชาที่ครูสอน + ข้อสอบกลาง + เกณฑ์ตรวจ · ส่งทางอีเมล/ไลน์ แล้วครูนำเข้าในแอป
        (ปุ่มอีเมลเปิดร่างให้ — ต้องแนบไฟล์เอง เพราะยังไม่มี server)</p>
    </section>

    <section class="card">
      <h3>รายวิชา</h3>
      ${subjects.length ? `<table class="table compact"><thead><tr><th>รหัส</th><th>ชื่อวิชา</th><th>ชั้น</th><th>ครูผู้สอน</th><th></th></tr></thead><tbody>
        ${subjects.map((x) => `<tr>
          <td class="mono">${esc(x.code)}</td><td>${esc(x.name)}</td><td>${esc(x.grade || "")}</td>
          <td><div class="chips small-chips">${teachers.map((t) => `<label class="chip"><input type="checkbox" data-st="${x.id}" value="${t.id}" ${(x.teacherIds || []).includes(t.id) ? "checked" : ""} /><span>${esc(t.name)}</span></label>`).join("") || `<span class="muted small">เพิ่มครูก่อน</span>`}</div></td>
          <td><button class="icon" data-del-s="${x.id}" aria-label="ลบ">${ico("x")}</button></td>
        </tr>`).join("")}</tbody></table>` : `<p class="muted">ยังไม่มีรายวิชา</p>`}
      <form id="sf" class="inline-form">
        <input name="code" placeholder="รหัสวิชา เช่น อ23101" required />
        <input name="name" placeholder="ชื่อวิชา" required />
        <select name="grade"><option value="">ชั้น</option>${GRADE_LEVELS.map((g) => `<option>${g}</option>`).join("")}</select>
        <button class="ghost">+ เพิ่มวิชา</button>
      </form>
    </section>

    <div class="row"><span class="spacer"></span><button id="pkg-all" class="ghost">ไฟล์ข้อมูลรวม (ทุกวิชา)</button></div>`;

  const pkg = async (tid) => {
    const data = await Transfer.schoolPackage(tid);
    const t = teachers.find((x) => x.id === tid);
    download(`Examer_ข้อมูลจากวิชาการ${t ? "_" + t.name.replace(/[\\/:*?"<>|\s]/g, "") : ""}.json`, JSON.stringify(data), "application/json");
  };
  $$("[data-pkg]").forEach((b) => (b.onclick = () => pkg(b.dataset.pkg)));
  $("#pkg-all").onclick = () => pkg(null);
  $$("[data-del-t]").forEach((b) => armButton(b, "ลบ?", async () => { await Store.del("teachers", b.dataset.delT); router(); }));
  $$("[data-del-s]").forEach((b) => armButton(b, "ลบ?", async () => { await Store.del("subjects", b.dataset.delS); router(); }));
  $$("[data-st]").forEach((cb) => (cb.onchange = async () => {
    const x = subjects.find((y) => y.id === cb.dataset.st);
    x.teacherIds = $$(`[data-st="${x.id}"]`).filter((c) => c.checked).map((c) => c.value);
    await Store.put("subjects", x);
    toast("บันทึกแล้ว");
  }));
  $("#tf").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await Store.put("teachers", { id: uid(), name: fd.get("name").trim(), email: fd.get("email").trim() });
    router();
  };
  $("#sf").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await Store.put("subjects", { id: uid(), code: fd.get("code").trim(), name: fd.get("name").trim(), grade: fd.get("grade"), teacherIds: [] });
    router();
  };
};
