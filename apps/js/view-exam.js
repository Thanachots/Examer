// การสอบ — ขั้นตอนงาน ① เตรียม → ② สแกน → ③ ตรวจทาน → ④ คะแนน

const STATUS_TH = { right: "ถูก", partial: "ถูกบางส่วน", wrong: "ผิด", review: "รอตรวจทาน", nokey: "ไม่มีเฉลย" };

// ================= สร้าง / แก้ข้อมูลการสอบ =================
function examInfoFields(exam, classes) {
  return `
    <div class="grid-fields">
      <label class="span2">ชื่อการสอบ<input name="name" value="${esc(exam.name)}" required placeholder="เช่น สอบกลางภาค คำศัพท์บทที่ 3" /></label>
      <label>วิชา<input name="subject" value="${esc(exam.subject)}" placeholder="ภาษาอังกฤษ" /></label>
      <label>รหัสวิชา<input name="subjectCode" value="${esc(exam.subjectCode)}" placeholder="อ23101" /></label>
      <label>ปีการศึกษา<input name="year" value="${esc(exam.year)}" inputmode="numeric" /></label>
      <label>ภาคเรียน<select name="term">${["1", "2", "ฤดูร้อน"].map((t) => `<option ${exam.term === t ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>วันที่สอบ<input type="date" name="date" value="${esc(exam.date)}" /></label>
      <label>จำนวนหน้ากระดาษคำตอบ
        <select name="pages">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${exam.pages === n ? "selected" : ""}>${n} หน้า (${n * ROWS} ข้อ)</option>`).join("")}</select>
      </label>
    </div>
    <fieldset class="rooms">
      <legend>ห้องที่สอบ</legend>
      ${classes.length ? classes.map((c) => `<label class="check"><input type="checkbox" name="classIds" value="${c.id}" ${(exam.classIds || []).includes(c.id) ? "checked" : ""} />${esc(c.name)} <span class="muted small">(${(c.students || []).length} คน)</span></label>`).join("")
        : `<p class="muted small">ยังไม่มีห้องเรียน — ไม่เลือกก็ได้ (ระบบจะใช้รหัสบนกระดาษอย่างเดียว ไม่มีชื่อนักเรียน)</p>`}
      <a href="#/class/new" class="small" id="add-class">+ เพิ่มห้องเรียนใหม่</a>
    </fieldset>`;
}

function readExamInfo(form, exam) {
  const fd = new FormData(form);
  Object.assign(exam, {
    name: fd.get("name").trim(), subject: fd.get("subject").trim(), subjectCode: fd.get("subjectCode").trim(),
    year: fd.get("year").trim(), term: fd.get("term"), date: fd.get("date"), pages: Number(fd.get("pages")) || 1,
    classIds: fd.getAll("classIds"),
  });
}

Views.examNew = async (root) => {
  const classes = (await Store.all("classes")).sort((a, b) => String(a.name).localeCompare(String(b.name), "th"));
  const exam = { name: "", subject: "", subjectCode: "", year: String(new Date().getFullYear() + 543), term: "2", date: new Date().toISOString().slice(0, 10), pages: 1, classIds: [] };
  root.innerHTML = `
    <div class="page-head"><div><a class="back" href="#/">← การสอบ</a><h2>สร้างการสอบ</h2></div></div>
    <form id="f" class="card form narrow">${examInfoFields(exam, classes)}
      <div class="row"><span class="spacer"></span><button class="primary" type="submit">ถัดไป: ใส่เฉลย →</button></div>
    </form>`;
  $("#add-class").onclick = () => sessionStorageSet("examer.returnTo", "#/exam/new");
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    readExamInfo(e.target, exam);
    Object.assign(exam, { id: uid(), keys: { 1: [], 2: [], 3: [] }, createdAt: Date.now() });
    await Store.put("exams", exam);
    location.hash = `#/exam/${exam.id}/setup`;
  };
  $("#f input").focus();
};

// ================= พื้นที่ทำงานของการสอบ =================
Views.exam = async (root, id, step) => {
  const ctx = await loadExamContext(id);
  if (!ctx) return (root.innerHTML = `<div class="empty-state"><h3>ไม่พบการสอบ</h3><a href="#/">กลับหน้าแรก</a></div>`);
  const { exam, classes, sum } = ctx;
  const c = sum.counts;
  const hasKey = SETS.some((n) => (exam.keys?.[n] || []).some(Boolean));
  step ||= !hasKey ? "setup" : !c.scanned ? "scan" : c.problems || c.reviewCells ? "review" : "scores";

  const steps = [
    ["setup", "เตรียม", hasKey ? "ใส่เฉลยแล้ว" : "ยังไม่มีเฉลย", hasKey ? "ok" : "todo"],
    ["scan", "สแกน", c.roster ? `${c.submitted}/${c.roster} คน` : `${c.scanned} แผ่น`, c.scanned ? (c.absent ? "part" : "ok") : "todo"],
    ["review", "ตรวจทาน", c.problems || c.reviewCells ? `${c.problems ? c.problems + " ปัญหา · " : ""}${c.reviewCells} ช่อง` : c.scanned ? "เรียบร้อย" : "—", c.problems ? "bad" : c.reviewCells ? "part" : c.scanned ? "ok" : "todo"],
    ["scores", "คะแนน", c.graded ? `${c.graded} คน` : "—", c.graded && !c.problems && !c.reviewCells ? "ok" : "todo"],
  ];

  root.innerHTML = `
    <div class="page-head">
      <div>
        <a class="back" href="#/">← การสอบ</a>
        <h2>${esc(exam.name)}</h2>
        <p class="muted">${esc([[exam.subjectCode, exam.subject].filter(Boolean).join(" "), classes.map((x) => x.name).join(", "), exam.term && exam.year ? `ภาค ${exam.term}/${exam.year}` : ""].filter(Boolean).join(" · "))}</p>
      </div>
    </div>
    <nav class="stepper">${steps.map(([k, label, sub, st], i) => `
      <a class="step ${k === step ? "active" : ""} ${st}" href="#/exam/${id}/${k}">
        <span class="step-n">${st === "ok" ? "✓" : i + 1}</span>
        <span class="step-t"><b>${label}</b><small>${esc(sub)}</small></span>
      </a>`).join("")}</nav>
    <div id="pane"></div>`;

  const pane = $("#pane");
  if (step === "setup") return paneSetup(pane, ctx);
  if (step === "scan") return paneScan(pane, ctx);
  if (step === "review") return paneReview(pane, ctx);
  if (step === "scores") return paneScores(pane, ctx);
};

// ---------- ① เตรียม ----------
async function paneSetup(pane, { exam }) {
  const allClasses = (await Store.all("classes")).sort((a, b) => String(a.name).localeCompare(String(b.name), "th"));
  let set = 1;
  const pages = () => Number($('[name="pages"]').value) || 1;
  const keys = Object.fromEntries(SETS.map((n) => [n, [...(exam.keys?.[n] || [])]]));

  pane.innerHTML = `
    <form id="ef" class="card form">
      <h3>ข้อมูลการสอบ</h3>
      ${examInfoFields(exam, allClasses)}
      <h3>เฉลย</h3>
      <p class="muted small">ข้อละ 1 คำ ตัวอักษร A–Z ไม่เกิน 20 ตัว · ข้อที่เว้นว่างไม่นับคะแนน · ใช้ชุดเดียวก็ได้ ชุดที่ไม่ใช้ปล่อยว่าง</p>
      <div class="set-tabs">${SETS.map((n) => `<button type="button" class="set-tab ${n === 1 ? "active" : ""}" data-set="${n}">ชุดที่ ${n} <span class="count" data-cnt="${n}"></span></button>`).join("")}</div>
      <div id="keys"></div>
      <details class="paste-key"><summary>วางเฉลยทั้งชุดทีเดียว</summary>
        <p class="muted small">บรรทัดละ 1 ข้อ เรียงจากข้อ 1 (บรรทัดว่าง = ข้อที่ไม่มีเฉลย)</p>
        <textarea id="kpaste" rows="5"></textarea>
        <button type="button" id="kapply" class="ghost small">ใส่ในชุดที่เลือก</button>
      </details>
      <div class="row">
        <button type="button" id="k-copy" class="ghost">คัดลอกจากชุดที่ 1</button>
        <button type="button" id="k-clear" class="ghost">ล้างชุดนี้</button>
        <span class="spacer"></span>
        <button type="button" id="del-exam" class="ghost danger">ลบการสอบ</button>
        <button class="primary" type="submit">บันทึก</button>
      </div>
    </form>`;

  $("#add-class").onclick = () => sessionStorageSet("examer.returnTo", `#/exam/${exam.id}/setup`);
  const box = $("#keys");
  const counts = () => SETS.forEach((n) => { $(`[data-cnt="${n}"]`).textContent = keys[n].slice(0, pages() * ROWS).filter(Boolean).length || ""; });
  const render = () => {
    let html = "";
    for (let p = 1; p <= pages(); p++) {
      if (pages() > 1) html += `<div class="key-page">หน้า ${p}</div>`;
      html += `<div class="key">` + Array.from({ length: ROWS }, (_, j) => {
        const i = (p - 1) * ROWS + j;
        return `<label><b>${i + 1}</b><input data-q="${i}" maxlength="${COLS}" value="${esc(keys[set][i] || "")}" autocomplete="off" spellcheck="false" autocapitalize="characters" /></label>`;
      }).join("") + `</div>`;
    }
    box.innerHTML = html;
    $$("input", box).forEach((el) => {
      el.addEventListener("input", () => { el.value = el.value.toUpperCase().replace(/[^A-Z]/g, ""); keys[set][el.dataset.q] = el.value; counts(); });
      el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); const n = $(`[data-q="${+el.dataset.q + 1}"]`, box); if (n) n.focus(); } });
    });
    counts();
  };
  render();
  $('[name="pages"]').onchange = render;
  $$(".set-tab").forEach((b) => (b.onclick = () => { set = Number(b.dataset.set); $$(".set-tab").forEach((x) => x.classList.toggle("active", x === b)); render(); }));
  $("#k-copy").onclick = () => { keys[set] = [...keys[1]]; render(); };
  $("#k-clear").onclick = () => { keys[set] = []; render(); };
  $("#kapply").onclick = () => {
    const lines = $("#kpaste").value.split(/\r?\n/).map((l) => l.toUpperCase().replace(/[^A-Z]/g, "").slice(0, COLS));
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    keys[set] = lines.slice(0, 4 * ROWS);
    $("#kpaste").value = "";
    render();
    toast(`ใส่เฉลย ${lines.filter(Boolean).length} ข้อในชุดที่ ${set}`);
  };
  armButton($("#del-exam"), "กดอีกครั้งเพื่อลบทั้งการสอบ", async () => { await Store.deleteExam(exam.id); location.hash = "#/"; });

  $("#ef").onsubmit = async (e) => {
    e.preventDefault();
    readExamInfo(e.target, exam);
    exam.keys = Object.fromEntries(SETS.map((n) => [n, Array.from({ length: exam.pages * ROWS }, (_, i) => (keys[n][i] || "").trim())]));
    await Store.put("exams", exam);
    toast("บันทึกแล้ว — คะแนนคำนวณใหม่อัตโนมัติ");
    location.hash = `#/exam/${exam.id}/scan`;
  };
}

// ---------- ② สแกน ----------
function paneScan(pane, { exam, sum }) {
  const live = Pipeline.isLive();
  pane.innerHTML = `
    ${live ? `<div id="eng" class="engine-line"></div>` : `<div class="notice">โหมดจำลอง — ผลอ่านเป็นข้อมูลสุ่ม · <a href="#/settings">เปลี่ยนในตั้งค่า</a></div>`}
    <div class="scan-actions">
      <label class="scan-btn camera">
        <input id="cam" type="file" accept="image/*" capture="environment" hidden />
        <span class="scan-ico">📷</span><b>ถ่ายรูปกระดาษ</b><small>ใช้กล้องมือถือ ทีละแผ่น</small>
      </label>
      <label id="drop" class="scan-btn">
        <input id="files" type="file" accept="image/*" multiple hidden />
        <span class="scan-ico">📁</span><b>อัปโหลดไฟล์</b><small>เลือก/ลากมาวางได้หลายแผ่น (JPG, PNG)</small>
      </label>
    </div>
    <p class="muted small tips">เคล็ดลับ: วางกระดาษบนพื้นสีเข้ม ให้เห็นสี่เหลี่ยมดำครบ 3 มุม · แสงสม่ำเสมอ ไม่มีเงามือ · ถ่ายตรงๆ ไม่ต้องเต็มจอ</p>
    <div id="progress" class="progress-line" hidden><div class="progress"><i></i></div><span class="small mono" id="pg-t"></span></div>
    <div id="feed" class="feed"></div>
    ${sum.sheets.length ? `<h3 class="section-h">กระดาษทั้งหมด (${sum.sheets.length} แผ่น)</h3>${sheetTable(sum.sheets)}` : ""}`;

  // โหลดโมเดลล่วงหน้า (ครั้งแรก ~40 MB) แสดงความคืบหน้า
  const showEngine = () => {
    const el = $("#eng");
    if (!el) return;
    const st = BrowserEngine.state();
    el.className = "engine-line " + st.status;
    el.innerHTML = st.status === "ready" ? `<span class="dot ok"></span> โมเดลพร้อม — ภาพตรวจในเครื่องนี้ ไม่ถูกส่งออกไปไหน`
      : st.status === "error" ? `<span class="dot bad"></span> โหลดโมเดลไม่สำเร็จ: ${esc(st.error)} <button class="ghost small" id="eng-retry">ลองใหม่</button>`
      : `<span class="dot warn"></span> ${esc(st.text)} <div class="progress"><i style="width:${Math.round(st.p * 100)}%"></i></div>`;
    const r = $("#eng-retry");
    if (r) r.onclick = () => BrowserEngine.load().catch(() => {});
  };
  if (live) {
    Page.onLeave(BrowserEngine.onChange(showEngine));
    showEngine();
    BrowserEngine.load().catch(() => {});
  }

  const feed = $("#feed");
  const addFeed = (sheet) => {
    const s2 = summarizeExam(exam, [sheet], [], Settings.get()); // แค่อ่านผลแผ่นนี้
    const info = s2.sheets[0];
    const el = document.createElement("a");
    el.href = `#/sheet/${sheet.id}`;
    el.className = "feed-item " + (sheet.error ? "bad" : "");
    el.innerHTML = sheet.error
      ? `<span class="dot bad"></span><span><b>${esc(sheet.fileName)}</b> — ตรวจไม่ได้: ${esc(sheet.error)}</span>`
      : `<span class="dot ${info.grade.lowCells ? "warn" : "ok"}"></span><span>รหัส <b class="mono">${esc(info.sid || "?")}</b> · ชุด ${info.grade.set} · หน้า ${info.grade.page}</span><span class="mono">${info.grade.max ? fmt(info.grade.score) + "/" + info.grade.max : ""}</span>`;
    feed.prepend(el);
  };

  async function upload(files) {
    files = files.filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png)$/i.test(f.name));
    if (!files.length) return toast("กรุณาเลือกไฟล์ภาพ");
    const bar = $("#progress");
    bar.hidden = false;
    for (let i = 0; i < files.length; i++) {
      $("#pg-t").textContent = `กำลังตรวจ ${i + 1}/${files.length}`;
      await processFile(files[i], exam, addFeed);
      $(".progress i", bar).style.width = pct(i + 1, files.length) + "%";
    }
    $("#pg-t").textContent = `เสร็จ ${files.length} แผ่น`;
    setTimeout(() => router(), files.length > 1 ? 900 : 600);
  }

  const drop = $("#drop");
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => upload([...e.dataTransfer.files]));
  $("#files").onchange = (e) => upload([...e.target.files]);
  $("#cam").onchange = (e) => upload([...e.target.files]);
  bindSheetTable();
}

function sheetTable(infos) {
  return `<table class="table">
    <thead><tr><th>นักเรียน</th><th class="hide-sm">รหัสที่อ่านได้</th><th>ชุด/หน้า</th><th>คะแนน</th><th>สถานะ</th><th></th></tr></thead>
    <tbody>${infos.map((i) => {
      const g = i.grade;
      const st = i.sheet.error ? pill("bad", "ตรวจไม่ได้") : i.issues.length ? pill("bad", i.issues[0].text) : g.lowCells ? pill("warn", `รอตรวจทาน ${g.lowCells}`) : pill("done", "เสร็จ");
      return `<tr data-href="#/sheet/${i.sheet.id}">
        <td>${i.student ? esc(studentLabel(i.student)) : `<span class="muted">—</span>`}</td>
        <td class="mono hide-sm">${esc(i.sid) || "—"}</td>
        <td>${g ? `${g.set} / ${g.page}` : "—"}</td>
        <td class="mono"><b>${g && g.max ? fmt(g.score) + "/" + g.max : "–"}</b></td>
        <td>${st}</td>
        <td><button class="icon" data-del="${i.sheet.id}" title="ลบแผ่นนี้">✕</button></td>
      </tr>`;
    }).join("")}</tbody></table>`;
}
function bindSheetTable() {
  $$("tr[data-href]").forEach((tr) => (tr.onclick = (e) => { if (!e.target.closest("button")) location.hash = tr.dataset.href; }));
  $$("[data-del]").forEach((b) => armButton(b, "ลบ?", async () => { await Store.del("sheets", b.dataset.del); router(); }));
}

// ---------- ③ ตรวจทาน ----------
async function paneReview(pane, { exam, sum, rules }) {
  const problems = sum.problems;
  const items = [];
  sum.sheets.forEach((info) => {
    if (!info.grade) return;
    info.sheet.result.reads.forEach((row, r) =>
      row.forEach((cell, c) => { if (cell.cls === "char" && cell.conf < rules.lowConf) items.push({ info, r, c }); })
    );
  });

  if (!problems.length && !items.length) {
    pane.innerHTML = `<div class="empty-state"><h3>ไม่มีอะไรต้องตรวจทาน</h3>
      <p class="muted">${sum.sheets.length ? "ทุกแผ่นจับคู่นักเรียนได้ และทุกช่องมีความมั่นใจพอ" : "ยังไม่มีกระดาษ"}</p>
      <a class="btn primary" href="#/exam/${exam.id}/${sum.sheets.length ? "scores" : "scan"}">${sum.sheets.length ? "ไปดูคะแนน →" : "ไปสแกน →"}</a></div>`;
    return;
  }

  const unclaimed = sum.students.filter((s) => s.status === "absent" || s.missingPages?.length);
  pane.innerHTML = `
    ${problems.length ? `<section class="card">
      <h3>กระดาษที่มีปัญหา <span class="count bad">${problems.length}</span></h3>
      <div class="problems">${problems.map((p) => `
        <div class="problem" data-id="${p.sheet.id}">
          <a class="thumb" href="#/sheet/${p.sheet.id}"><canvas></canvas></a>
          <div class="p-info">
            <b>${esc(p.issues.map((i) => i.text).join(" · "))}</b>
            <span class="muted small">${esc(p.sheet.fileName)}${p.grade ? ` · ชุด ${p.grade.set} หน้า ${p.grade.page} · ${fmt(p.grade.score)}/${p.grade.max}` : ""}</span>
          </div>
          <div class="p-act">
            ${p.sheet.error ? `<button class="ghost" data-retry>ลองตรวจใหม่</button>`
              : p.issues.some((i) => i.kind === "id" || i.kind === "dup" || i.kind === "idconf") && sum.counts.roster ? `
              <select data-assign><option value="">— เลือกนักเรียน —</option>
                ${unclaimed.map((s) => `<option value="${esc(s.sid)}">${esc(studentLabel(s))}${s.room ? " (" + esc(s.room) + ")" : ""}</option>`).join("")}
                <option disabled>──────</option>
                ${sum.students.filter((s) => !unclaimed.includes(s)).map((s) => `<option value="${esc(s.sid)}">${esc(studentLabel(s))} · มีกระดาษแล้ว</option>`).join("")}
              </select>`
              : p.issues.some((i) => i.kind === "id" || i.kind === "idconf") ? `
              <input data-typeid class="mono" placeholder="พิมพ์รหัสนักเรียน" inputmode="numeric" value="${esc(p.sid)}" size="12" />
              <button class="ghost" data-saveid>บันทึก</button>` : ""}
            <button class="ghost danger" data-remove>ลบแผ่น</button>
          </div>
        </div>`).join("")}</div>
    </section>` : ""}

    ${items.length ? `<section class="card">
      <h3>ช่องที่ระบบไม่มั่นใจ <span class="count warn" id="left">${items.length}</span></h3>
      <p class="muted small">ดูภาพลายมือ แล้วพิมพ์ตัวที่ถูก · <kbd>Enter</kbd> ยืนยัน · <kbd>-</kbd> = ขีดฆ่า · ลบให้ว่าง = ช่องว่าง · กดตัวเลือกด้านขวาก็ได้</p>
      <div class="queue">${items.map((it, i) => {
        const row = it.info.sheet.result.reads[it.r];
        const cell = row[it.c];
        const ctxWord = row.map((c2, j) => c2.cls === "empty" ? "" : `<span class="${j === it.c ? "hl" : c2.cls === "crossed" ? "x" : ""}">${esc(c2.char)}</span>`).join("");
        const g = it.info.grade.rows[it.r];
        // ตัวเลือก = ผลอ่านอันดับ 1–3 ของโมเดล (ไม่ใช้เฉลยช่วยเดา เพื่อไม่ให้ชี้นำครู)
        const opts = [...new Set([cell.char, ...(cell.top3 || []).map((t) => t[0])])].filter((x) => /^[A-Z]$/.test(x)).slice(0, 3);
        return `<div class="q-item" data-i="${i}">
          <div class="q-crop"></div>
          <div class="q-info">
            <div><b>${esc(it.info.student ? studentLabel(it.info.student) : "รหัส " + (it.info.sid || "?"))}</b> <span class="muted small">· ข้อ ${g.q} ช่อง ${it.c + 1}</span></div>
            <div class="ctx mono">${ctxWord}</div>
            <div class="muted small">ระบบอ่าน “${esc(cell.char)}” · มั่นใจ ${Math.round(cell.conf * 100)}%</div>
          </div>
          <div class="q-opts">${opts.map((o) => `<button type="button" class="opt" data-v="${o}">${o}</button>`).join("")}</div>
          <input class="q-input mono" maxlength="1" value="${esc(cell.char)}" aria-label="ตัวอักษรที่ถูกต้อง" autocapitalize="characters" />
          <button class="primary q-ok">ยืนยัน</button>
        </div>`;
      }).join("")}</div>
    </section>` : ""}`;

  // ภาพย่อของแผ่นที่มีปัญหา
  for (const el of $$(".problem")) {
    const p = problems.find((x) => x.sheet.id === el.dataset.id);
    const img = await sheetImage(p.sheet);
    if (img) { const cv = $("canvas", el); cv.width = 90; cv.height = Math.round(90 * img.naturalHeight / img.naturalWidth); cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); }
    const sel = $("[data-assign]", el);
    if (sel) sel.onchange = async () => { if (!sel.value) return; p.sheet.studentId = sel.value; await Store.put("sheets", p.sheet); toast("จับคู่แล้ว"); router(); };
    const typed = $("[data-typeid]", el);
    if (typed) {
      const saveId = async () => { const v = typed.value.trim(); if (!v) return; p.sheet.studentId = v; await Store.put("sheets", p.sheet); toast("บันทึกแล้ว"); router(); };
      $("[data-saveid]", el).onclick = saveId;
      typed.addEventListener("keydown", (e) => { if (e.key === "Enter") saveId(); });
    }
    const retry = $("[data-retry]", el);
    if (retry) retry.onclick = async () => {
      retry.disabled = true; retry.textContent = "กำลังตรวจ…";
      try { p.sheet.result = await Pipeline.run(p.sheet.image, exam); delete p.sheet.error; }
      catch (e) { p.sheet.error = e.message; }
      await Store.put("sheets", p.sheet); router();
    };
    armButton($("[data-remove]", el), "ลบ?", async () => { await Store.del("sheets", p.sheet.id); router(); });
  }

  // คิวช่องไม่มั่นใจ
  const imgs = new Map();
  for (const el of $$(".q-item")) {
    const it = items[el.dataset.i];
    const sh = it.info.sheet;
    if (!imgs.has(sh.id)) imgs.set(sh.id, await sheetImage(sh));
    $(".q-crop", el).appendChild(cellCrop(sh, imgs.get(sh.id), it.r, it.c));
    const input = $(".q-input", el);
    const commit = async (val) => {
      const v = (val ?? input.value).trim().toUpperCase();
      if (v && v !== "-" && !/^[A-Z]$/.test(v)) return toast("ใส่ได้ทีละ 1 ตัว A–Z");
      setCell(sh.result.reads[it.r][it.c], v === "-" ? "crossed" : v || "empty");
      await Store.put("sheets", sh);
      el.classList.add("done");
      const left = $$(".q-item:not(.done)");
      $("#left").textContent = left.length;
      const next = left.find((x) => +x.dataset.i > +el.dataset.i) || left[0];
      if (next) { const ni = $(".q-input", next); ni.focus(); ni.select(); next.scrollIntoView({ block: "center", behavior: "smooth" }); }
      else setTimeout(router, 500);
    };
    input.addEventListener("input", () => (input.value = input.value.toUpperCase()));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); });
    $(".q-ok", el).onclick = () => commit();
    $$(".opt", el).forEach((b) => (b.onclick = () => commit(b.dataset.v)));
  }
  const first = $(".q-input");
  if (first) { first.focus({ preventScroll: true }); first.select(); }
}

// ---------- ④ คะแนน ----------
function paneScores(pane, { exam, classes, sum }) {
  const rooms = [...new Set(sum.students.map((s) => s.room).filter(Boolean))];
  let room = "";
  const c = sum.counts;

  pane.innerHTML = `
    ${c.problems || c.reviewCells ? `<div class="notice">ยังมี${c.problems ? ` ${c.problems} แผ่นที่มีปัญหา` : ""}${c.reviewCells ? ` ${c.reviewCells} ช่องรอตรวจทาน` : ""} — คะแนนอาจยังไม่ใช่ตัวสุดท้าย <a href="#/exam/${exam.id}/review">ไปตรวจทาน →</a></div>` : ""}
    <div class="row toolbar">
      ${rooms.length > 1 ? `<select id="room"><option value="">ทุกห้อง</option>${rooms.map((r) => `<option>${esc(r)}</option>`).join("")}</select>` : ""}
      <span class="spacer"></span>
      <button id="csv" class="ghost">ส่งออก Excel (CSV)</button>
      <button id="print" class="ghost">พิมพ์</button>
    </div>
    <div id="stats"></div>
    <section class="card flush print-area">
      <div class="print-only print-head">
        <b>${esc(exam.name)}</b> — ${esc([exam.subjectCode, exam.subject].filter(Boolean).join(" "))} ${esc(classes.map((x) => x.name).join(", "))} ${exam.date ? "· " + esc(thaiDate(exam.date)) : ""}
      </div>
      <table class="table score-table" id="scores"></table>
    </section>
    <section class="card" id="items"></section>`;

  const render = () => {
    const list = sum.students.filter((s) => !room || s.room === room);
    const graded = list.filter((s) => s.sheets.length && s.max);
    const p = graded.map((s) => pct(s.score, s.max));
    const mean = p.length ? p.reduce((a, b) => a + b, 0) / p.length : 0;
    const sd = p.length ? Math.sqrt(p.reduce((s, x) => s + (x - mean) ** 2, 0) / p.length) : 0;
    const full = graded[0]?.max || sum.fullMax(1);
    const avgScore = graded.length ? graded.reduce((s, x) => s + x.score, 0) / graded.length : 0;

    $("#stats").innerHTML = `<div class="stats">
      <div class="stat"><b>${graded.length}<span class="muted">/${list.length}</span></b><span>คนที่มีคะแนน</span></div>
      <div class="stat"><b>${graded.length ? fmt(Math.round(avgScore * 10) / 10) : "–"}<span class="muted">/${full}</span></b><span>คะแนนเฉลี่ย (${Math.round(mean)}%)</span></div>
      <div class="stat"><b>${graded.length ? Math.round(sd) + "%" : "–"}</b><span>ส่วนเบี่ยงเบนมาตรฐาน</span></div>
      <div class="stat"><b>${graded.length ? `${Math.max(...graded.map((s) => s.score))} / ${Math.min(...graded.map((s) => s.score))}` : "–"}</b><span>สูงสุด / ต่ำสุด</span></div>
    </div>`;

    $("#scores").innerHTML = `
      <thead><tr><th>เลขที่</th><th>เลขประจำตัว</th><th>ชื่อ-สกุล</th>${rooms.length > 1 && !room ? "<th>ห้อง</th>" : ""}<th>ชุด</th><th>คะแนน</th><th class="no-print">สถานะ</th></tr></thead>
      <tbody>${list.map((s) => {
        const st = STUDENT_STATUS[s.status];
        const href = s.sheets[0] ? `#/sheet/${s.sheets[s.sheets.length - 1].sheet.id}` : "";
        return `<tr ${href ? `data-href="${href}"` : ""} class="${s.status === "absent" ? "absent" : ""}">
          <td>${s.no ?? ""}</td><td class="mono">${esc(s.sid)}</td><td>${esc(s.name)}</td>
          ${rooms.length > 1 && !room ? `<td>${esc(s.room)}</td>` : ""}
          <td>${s.set ?? ""}</td>
          <td class="mono"><b>${s.sheets.length ? fmt(s.score) : "–"}</b><span class="muted">/${s.max || full}</span></td>
          <td class="no-print">${pill(st.cls, st.text + (s.status === "partial" ? ` (${s.missingPages.join(",")})` : ""))}</td>
        </tr>`;
      }).join("")}</tbody>`;
    $$("#scores tr[data-href]").forEach((tr) => (tr.onclick = () => (location.hash = tr.dataset.href)));

    // วิเคราะห์รายข้อ
    const nQ = (exam.pages || 1) * ROWS;
    const stats = Array.from({ length: nQ }, (_, q) => ({ q: q + 1, n: 0, right: 0 }));
    graded.forEach((s) => s.sheets.forEach((i) => i.grade.rows.forEach((r) => { if (r.max) { stats[r.q - 1].n++; stats[r.q - 1].right += r.points; } })));
    const shown = stats.filter((x) => x.n);
    $("#items").innerHTML = shown.length ? `
      <h3>วิเคราะห์รายข้อ</h3>
      <p class="muted small">% นักเรียนที่ตอบถูก — ข้อที่ต่ำกว่า 40% (สีแดง) อาจเป็นข้อยาก หรือเฉลยผิด ควรตรวจเฉลยอีกครั้ง</p>
      <div class="items">${shown.map((it) => { const v = pct(it.right, it.n); return `
        <div class="item-row ${v < 40 ? "hard" : ""}"><span class="mono">ข้อ ${it.q}</span><div class="bar"><i style="width:${v}%"></i></div><span class="mono">${v}%</span></div>`; }).join("")}</div>`
      : `<p class="muted">ยังไม่มีคะแนน</p>`;
  };
  render();
  const sel = $("#room");
  if (sel) sel.onchange = () => { room = sel.value; render(); };

  $("#print").onclick = () => window.print();
  $("#csv").onclick = () => {
    const nQ = (exam.pages || 1) * ROWS;
    const list = sum.students.filter((s) => !room || s.room === room);
    const lines = [csvRow(["เลขที่", "เลขประจำตัว", "ชื่อ-สกุล", "ห้อง", "ชุด", "คะแนน", "คะแนนเต็ม", "สถานะ", ...Array.from({ length: nQ }, (_, i) => `ข้อ${i + 1}`)])];
    for (const s of list) {
      const perQ = Array(nQ).fill("");
      s.sheets.forEach((i) => i.grade.rows.forEach((r) => { if (r.max) perQ[r.q - 1] = fmt(r.points); }));
      lines.push(csvRow([s.no ?? "", s.sid, s.name, s.room, s.set ?? "", s.sheets.length ? fmt(s.score) : "", s.max || "", STUDENT_STATUS[s.status].text, ...perQ]));
    }
    const name = [exam.subjectCode, exam.name, room].filter(Boolean).join("_").replace(/[\\/:*?"<>|]/g, "");
    download(`${name}.csv`, "﻿" + lines.join("\r\n"), "text/csv");
  };
}
