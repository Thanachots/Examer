// ครู — การสอบ 1 ชุด: ① ถ่ายรูป → ② ตรวจ/แก้ → ③ คะแนน
// (ข้อมูลการสอบ + เฉลย ตั้งครั้งเดียวในหน้า "สร้างการสอบ" ไม่นับเป็นขั้นตอน)

const STATUS_TH = { right: "ถูก", partial: "ถูกบางส่วน", wrong: "ผิด", review: "รอตรวจ", nokey: "ไม่มีเฉลย" };
const STEPS = [
  ["photo", "ถ่ายรูป", "camera"],
  ["check", "ตรวจ/แก้", "check"],
  ["score", "คะแนน", "table"],
];
const LEGACY_STEP = { setup: "edit", scan: "photo", review: "check", scores: "score" };

const hasAnyKey = (exam) => SETS.some((n) => (exam.keys?.[n] || []).some(Boolean));

// ขั้นต่อไปที่ครูควรทำ — ใช้ทั้งหน้าแรกและในหน้าการสอบ
function nextAction(exam, sum) {
  const c = sum.counts;
  const base = `#/exam/${exam.id}`;
  if (!hasAnyKey(exam)) return { text: "ใส่เฉลย", href: `${base}/edit`, tone: "warn" };
  if (!c.scanned) return { text: "ถ่ายรูปกระดาษคำตอบ", href: `${base}/photo`, tone: "primary" };
  if (c.pending) return { text: `กำลังตรวจ… เหลือ ${c.pending} แผ่น`, href: `${base}/photo`, tone: "muted" };
  const fix = c.problems + c.reviewCells;
  if (fix) return { text: `ตรวจ/แก้ ${fix} จุด`, href: `${base}/check`, tone: "warn" };
  if (c.roster && c.absent) return { text: `ยังขาด ${c.absent} คน — ถ่ายรูปเพิ่ม`, href: `${base}/photo`, tone: "primary", alt: { text: "ดูคะแนน", href: `${base}/score` } };
  if (!exam.sentAt) return { text: "ส่งคะแนนให้ฝ่ายวิชาการ", href: `${base}/score`, tone: "primary" };
  return { text: "ส่งแล้ว ดูคะแนน", href: `${base}/score`, tone: "done" };
}

// ================= สร้าง / แก้ไขการสอบ =================
Views.examNew = async (root) => {
  const s = Settings.get();
  const exam = { name: "", kind: "quiz", classIds: [], pages: 1, keys: { 1: [], 2: [], 3: [] }, date: new Date().toISOString().slice(0, 10), year: s.year, term: s.term };
  await renderExamForm(root, exam, {
    title: "สร้างการสอบ", back: "#/",
    onSaved: (e) => (location.hash = `#/exam/${e.id}/photo`),
  });
};

Views.examEdit = async (root, id) => {
  const exam = await Store.get("exams", id);
  if (!exam) return (root.innerHTML = `<div class="empty-state"><h3>ไม่พบการสอบ</h3><a href="#/">กลับหน้าแรก</a></div>`);
  const isAdmin = Settings.get().role === "admin";
  await renderExamForm(root, exam, {
    title: exam.central ? "ข้อสอบกลาง" : "แก้ไขการสอบและเฉลย",
    back: isAdmin ? "#/central" : `#/exam/${id}`,
    central: !!exam.central,
    readonlyKey: !!exam.central && !isAdmin,
    onSaved: (e) => (location.hash = isAdmin ? "#/central" : `#/exam/${e.id}`),
    onDelete: exam.central && !isAdmin ? null : async () => { await Store.deleteExam(id); location.hash = isAdmin ? "#/central" : "#/"; },
  });
};

// ================= พื้นที่ทำงาน 3 ขั้น =================
function stepperHTML(exam, sum, step) {
  const c = sum.counts;
  const fix = c.problems + c.reviewCells;
  const sub = {
    photo: c.pending ? `กำลังตรวจ ${c.pending} แผ่น` : c.roster ? `${c.submitted}/${c.roster} คน` : `${c.scanned} แผ่น`,
    check: c.scanned ? (fix ? `ต้องแก้ ${fix} จุด` : "เรียบร้อย") : "—",
    score: exam.sentAt ? "ส่งแล้ว" : c.graded ? `${c.graded} คน` : "—",
  };
  const st = {
    photo: c.pending ? "part" : c.scanned ? (c.absent ? "part" : "ok") : "todo",
    check: !c.scanned ? "todo" : c.problems ? "bad" : fix ? "part" : "ok",
    score: exam.sentAt ? "ok" : "todo",
  };
  return `<nav class="stepper three">${STEPS.map(([k, label], i) => `
    <a class="step ${k === step ? "active" : ""} ${st[k]}" href="#/exam/${exam.id}/${k}">
      <span class="step-n">${st[k] === "ok" ? ico("check") : i + 1}</span>
      <span class="step-t"><b>${label}</b><small>${esc(sub[k])}</small></span>
    </a>`).join("")}</nav>`;
}

Views.exam = async (root, id, step) => {
  step = LEGACY_STEP[step] || step;
  if (step === "edit") return Views.examEdit(root, id);
  const ctx = await loadExamContext(id);
  if (!ctx) return (root.innerHTML = `<div class="empty-state"><h3>ไม่พบการสอบ</h3><a href="#/">กลับหน้าแรก</a></div>`);
  const { exam, classes, sum } = ctx;
  const c = sum.counts;
  if (!step) step = !c.scanned || c.pending ? "photo" : c.problems || c.reviewCells ? "check" : "score";

  root.innerHTML = `
    <div class="page-head exam-head">
      <div>
        <a class="back" href="#/">${ico("back")}การสอบของฉัน</a>
        <h2>${esc(exam.name)}</h2>
        <p class="muted">${esc([exam.subjectCode, classes.map((x) => x.name).join(", "), EXAM_KINDS[exam.kind]].filter(Boolean).join(" · "))}
          ${exam.central ? pill("muted", "ข้อสอบกลาง") : ""}</p>
      </div>
      <a class="btn ghost" href="#/exam/${id}/edit">${exam.central ? "ดูเฉลย" : "แก้ไขเฉลย/ข้อมูล"}</a>
    </div>
    ${stepperHTML(exam, sum, step)}
    <div id="pane"></div>`;

  const pane = $("#pane");
  if (step === "photo") return panePhoto(pane, ctx);
  if (step === "check") return paneCheck(pane, ctx);
  return paneScore(pane, ctx);
};

// ---------- ① ถ่ายรูป ----------
function panePhoto(pane, { exam, sum }) {
  const live = Pipeline.isLive();
  pane.innerHTML = `
    ${hasAnyKey(exam) ? "" : `<div class="notice">ยังไม่ได้ใส่เฉลย — ถ่ายรูปได้ แต่จะยังไม่มีคะแนน · <a href="#/exam/${exam.id}/edit">ใส่เฉลย</a></div>`}
    ${live ? `<div id="eng" class="engine-line"></div>` : `<div class="notice">โหมดทดลอง — ผลอ่านเป็นข้อมูลสุ่ม · <a href="#/settings">เปลี่ยนในตั้งค่า</a></div>`}
    <div class="scan-actions">
      <label class="scan-btn camera">
        <input id="cam" type="file" accept="image/*" capture="environment" hidden />
        <span class="scan-ico">${ico("camera")}</span><b>ถ่ายรูปกระดาษ</b><small>ถ่ายทีละแผ่น ถ่ายต่อได้เลยไม่ต้องรอ</small>
      </label>
      <label id="drop" class="scan-btn">
        <input id="files" type="file" accept="image/*" multiple hidden />
        <span class="scan-ico">${ico("image")}</span><b>เลือกรูปจากเครื่อง</b><small>เลือกหลายรูปพร้อมกันได้ · ลากมาวางก็ได้</small>
      </label>
    </div>
    <details class="tips"><summary>ถ่ายอย่างไรให้ตรวจแม่น</summary>
      <ul>
        <li>เห็น<b>สี่เหลี่ยมดำครบ 3 มุม</b> (ล่างซ้าย, ล่างขวา, กล่องเลข 2 มุมขวาบน)</li>
        <li>วางกระดาษบนโต๊ะสีเข้ม แสงสม่ำเสมอ ไม่มีเงามือหรือเงาโทรศัพท์</li>
        <li>ถ่ายจากด้านบนตรงๆ ไม่ต้องเต็มจอ เอียงเล็กน้อยได้</li>
      </ul>
    </details>
    <div id="qline" class="engine-line" hidden></div>
    <div id="feed" class="feed"></div>
    <div id="sheet-list"></div>
    <div id="next" class="next-cta"></div>`;

  const showEngine = () => {
    const el = $("#eng");
    if (!el) return;
    const st = BrowserEngine.state();
    el.className = "engine-line " + st.status;
    el.innerHTML = st.status === "ready" ? `<span class="dot ok"></span> ระบบตรวจพร้อม — รูปตรวจในเครื่องนี้ ไม่ถูกส่งออกไปไหน`
      : st.status === "error" ? `<span class="dot bad"></span> เตรียมระบบตรวจไม่สำเร็จ: ${esc(st.error)} <button class="ghost small" id="eng-retry">ลองใหม่</button>`
      : `<span class="dot warn"></span> กำลังเตรียมระบบตรวจ (ครั้งแรกใช้เวลาสักครู่) <div class="progress"><i style="width:${Math.round(st.p * 100)}%"></i></div>`;
    const r = $("#eng-retry");
    if (r) r.onclick = () => BrowserEngine.load().catch(() => {});
  };
  if (live) {
    Page.onLeave(BrowserEngine.onChange(showEngine));
    showEngine();
    BrowserEngine.load().catch(() => {});
  }

  const feed = $("#feed");
  const renderList = (sum2) => {
    $("#sheet-list").innerHTML = sum2.sheets.length
      ? `<details class="all-sheets" ${sum2.sheets.length <= 8 ? "open" : ""}><summary>กระดาษทั้งหมด ${sum2.sheets.length} แผ่น</summary>${sheetTable(sum2.sheets)}</details>` : "";
    bindSheetTable();
    const na = nextAction(exam, sum2);
    $("#next").innerHTML = sum2.counts.scanned && !sum2.counts.pending && !na.href.endsWith("/photo")
      ? `<a class="btn primary big" href="${na.href}">${esc(na.text)}</a>` : "";
  };
  renderList(sum);

  // ผลแต่ละแผ่นขึ้นทันที → แผ่นไหนอ่านรหัสไม่ได้ ถ่ายใหม่ตอนนั้นได้เลย
  const addFeed = (info) => {
    const el = document.createElement("a");
    el.href = `#/sheet/${info.sheet.id}`;
    const bad = info.sheet.error || info.issues.length;
    el.className = "feed-item " + (bad ? "bad" : "");
    const who = info.student ? esc(studentLabel(info.student)) : `เลขประจำตัว <b class="mono">${esc(info.sid || "?")}</b>`;
    el.innerHTML = info.sheet.error
      ? `<span class="dot bad"></span><span>ตรวจไม่ได้ — ${esc(info.sheet.error)}</span><span class="small">ถ่ายใหม่</span>`
      : `<span class="dot ${bad ? "bad" : info.grade.lowCells ? "warn" : "ok"}"></span><span>${who}${info.issues.length ? ` · <b>${esc(info.issues[0].text)}</b>` : ""}</span><span class="mono">${info.grade.max ? fmt(info.grade.score) + "/" + info.grade.max : ""}</span>`;
    feed.prepend(el);
  };

  const showQueue = (st) => {
    const el = $("#qline");
    if (!el) return;
    el.hidden = !st.pending;
    el.innerHTML = `<span class="dot warn"></span> กำลังตรวจ… เหลือ ${st.pending} แผ่น <span class="muted small">— ถ่ายแผ่นต่อไปหรือไปหน้าอื่นได้เลย</span>`;
  };
  showQueue(ScanQueue.state());
  Page.onLeave(ScanQueue.onChange(async (st, done) => {
    showQueue(st);
    if (!done || done.examId !== exam.id) return;
    const ctx = await loadExamContext(exam.id);
    if (!ctx) return;
    const info = ctx.sum.sheets.find((i) => i.sheet.id === done.id);
    if (info) addFeed(info);
    renderList(ctx.sum);
    const nav = $(".stepper");
    if (nav) nav.outerHTML = stepperHTML(ctx.exam, ctx.sum, "photo");
  }));

  async function upload(files) {
    files = files.filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|heic|heif)$/i.test(f.name));
    if (!files.length) return toast("กรุณาเลือกรูปภาพ");
    await ScanQueue.add(files, exam);
    toast(files.length > 1 ? `รับ ${files.length} แผ่นแล้ว กำลังตรวจ` : "รับแล้ว ถ่ายแผ่นต่อไปได้เลย");
    const ctx = await loadExamContext(exam.id);
    if (ctx) renderList(ctx.sum);
  }

  const drop = $("#drop");
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => upload([...e.dataTransfer.files]));
  $("#files").onchange = (e) => { upload([...e.target.files]); e.target.value = ""; };
  $("#cam").onchange = (e) => { upload([...e.target.files]); e.target.value = ""; };
}

function sheetTable(infos) {
  const curr = ScanQueue.state().current;
  return `<table class="table">
    <thead><tr><th>นักเรียน</th><th class="hide-sm">เลขประจำตัวที่อ่านได้</th><th class="hide-sm">ชุด/หน้า</th><th>คะแนน</th><th>สถานะ</th><th></th></tr></thead>
    <tbody>${infos.map((i) => {
      const g = i.grade;
      const st = i.pending ? pill("muted", i.sheet.id === curr ? "กำลังตรวจ…" : "รอคิว")
        : i.sheet.error ? pill("bad", "ตรวจไม่ได้") : i.issues.length ? pill("bad", i.issues[0].text) : g.lowCells ? pill("warn", `แก้ ${g.lowCells} จุด`) : pill("done", "เรียบร้อย");
      return `<tr data-href="#/sheet/${i.sheet.id}">
        <td>${i.student ? esc(studentLabel(i.student)) : `<span class="muted">${i.pending ? "—" : "ไม่ทราบชื่อ"}</span>`}</td>
        <td class="mono hide-sm">${esc(i.sid) || "—"}</td>
        <td class="hide-sm">${g ? `${g.set} / ${g.page}` : "—"}</td>
        <td class="mono"><b>${g && g.max ? fmt(g.score) + "/" + g.max : "–"}</b></td>
        <td>${st}</td>
        <td><button class="icon" data-del="${i.sheet.id}" title="ลบแผ่นนี้" aria-label="ลบแผ่นนี้">${ico("x")}</button></td>
      </tr>`;
    }).join("")}</tbody></table>`;
}
function bindSheetTable() {
  $$("tr[data-href]").forEach((tr) => (tr.onclick = (e) => { if (!e.target.closest("button")) location.hash = tr.dataset.href; }));
  $$("[data-del]").forEach((b) => armButton(b, "ลบ?", async () => { await Store.del("sheets", b.dataset.del); router(); }));
}

// ---------- ② ตรวจ/แก้ ----------
async function paneCheck(pane, { exam, sum, rules }) {
  const problems = sum.problems;
  const items = [];
  sum.sheets.forEach((info) => {
    if (!info.grade) return;
    info.sheet.result.reads.forEach((row, r) =>
      row.forEach((cell, c) => { if (cell.cls === "char" && cell.conf < rules.lowConf) items.push({ info, r, c }); })
    );
  });
  const allList = sum.sheets.length ? `<details class="all-sheets"><summary>ดูกระดาษทีละแผ่น (${sum.sheets.length} แผ่น)</summary>${sheetTable(sum.sheets)}</details>` : "";

  if (!problems.length && !items.length) {
    pane.innerHTML = `<div class="empty-state ok-state"><div class="big-ico">${ico("check")}</div><h3>${sum.sheets.length ? "ไม่มีอะไรต้องแก้" : "ยังไม่มีกระดาษ"}</h3>
      <p class="muted">${sum.sheets.length ? (sum.counts.pending ? `ยังตรวจไม่เสร็จอีก ${sum.counts.pending} แผ่น` : "ทุกแผ่นรู้ว่าเป็นของใคร และระบบอ่านได้ชัดทุกช่อง") : "เริ่มจากถ่ายรูปกระดาษคำตอบ"}</p>
      <a class="btn primary big" href="#/exam/${exam.id}/${sum.sheets.length ? "score" : "photo"}">${sum.sheets.length ? "ไปดูคะแนน" : "ไปถ่ายรูป"}</a></div>${allList}`;
    bindSheetTable();
    return;
  }

  const unclaimed = sum.students.filter((s) => s.status === "absent" || s.missingPages?.length);
  pane.innerHTML = `
    ${problems.length ? `<section class="card">
      <h3>กระดาษที่ต้องจัดการ <span class="count bad">${problems.length}</span></h3>
      <p class="muted small">เลือกว่าเป็นของนักเรียนคนไหน หรือถ่ายใหม่ถ้ารูปไม่ชัด</p>
      <div class="problems">${problems.map((p) => `
        <div class="problem" data-id="${p.sheet.id}">
          <a class="thumb" href="#/sheet/${p.sheet.id}" title="ดูรูปเต็ม"><canvas></canvas></a>
          <div class="p-info">
            <b>${esc(p.issues.map((i) => i.text).join(" · "))}</b>
            <span class="muted small">${p.grade ? `คะแนน ${fmt(p.grade.score)}/${p.grade.max}` : esc(p.sheet.fileName)}</span>
          </div>
          <div class="p-act">
            ${p.sheet.error ? `<button class="ghost" data-retry>ลองตรวจใหม่</button>`
              : p.issues.some((i) => i.kind === "id" || i.kind === "dup" || i.kind === "idconf") && sum.counts.roster ? `
              <select data-assign aria-label="เลือกนักเรียน"><option value="">— เป็นของใคร? —</option>
                ${unclaimed.map((s) => `<option value="${esc(s.sid)}">${esc(studentLabel(s))}${s.room ? " (" + esc(s.room) + ")" : ""}</option>`).join("")}
                <option disabled>── มีกระดาษแล้ว ──</option>
                ${sum.students.filter((s) => !unclaimed.includes(s)).map((s) => `<option value="${esc(s.sid)}">${esc(studentLabel(s))}</option>`).join("")}
              </select>`
              : p.issues.some((i) => i.kind === "id" || i.kind === "idconf") ? `
              <input data-typeid class="mono" placeholder="เลขประจำตัว" inputmode="numeric" value="${esc(p.sid)}" size="10" />
              <button class="ghost" data-saveid>บันทึก</button>` : ""}
            <button class="ghost danger" data-remove>ลบ</button>
          </div>
        </div>`).join("")}</div>
    </section>` : ""}

    ${items.length ? `<section class="card">
      <h3>ตัวอักษรที่ระบบไม่แน่ใจ <span class="count warn" id="left">${items.length}</span></h3>
      <p class="muted small">ดูลายมือในรูป แล้วแตะตัวที่ถูก · ถ้าไม่มีให้เลือก พิมพ์เองแล้วกดยืนยัน · ช่องที่ขีดฆ่า กด “ขีดฆ่า”</p>
      <div class="queue">${items.map((it, i) => {
        const row = it.info.sheet.result.reads[it.r];
        const cell = row[it.c];
        const ctxWord = row.map((c2, j) => c2.cls === "empty" ? "" : `<span class="${j === it.c ? "hl" : c2.cls === "crossed" ? "x" : ""}">${esc(c2.char)}</span>`).join("");
        const g = it.info.grade.rows[it.r];
        // ตัวเลือก = ผลอ่านอันดับ 1–3 ของระบบ (ไม่เอาเฉลยมาช่วยเดา เพื่อไม่ให้ชี้นำครู)
        const opts = [...new Set([cell.char, ...(cell.top3 || []).map((t) => t[0])])].filter((x) => /^[A-Z]$/.test(x)).slice(0, 3);
        return `<div class="q-item" data-i="${i}">
          <div class="q-crop"></div>
          <div class="q-info">
            <div><b>${esc(it.info.student ? studentLabel(it.info.student) : "เลขประจำตัว " + (it.info.sid || "?"))}</b></div>
            <div class="muted small">ข้อ ${g.q} · ตัวที่ ${it.c + 1} ของคำ</div>
            <div class="ctx mono">${ctxWord}</div>
          </div>
          <div class="q-opts">${opts.map((o) => `<button type="button" class="opt" data-v="${o}">${o}</button>`).join("")}
            <button type="button" class="opt small-opt" data-v="-" title="ช่องนี้ถูกขีดฆ่า">ขีดฆ่า</button></div>
          <div class="q-typed"><input class="q-input mono" maxlength="1" value="" placeholder="?" aria-label="พิมพ์ตัวอักษรที่ถูก" autocapitalize="characters" />
          <button class="primary q-ok" aria-label="ยืนยัน">${ico("check")}</button></div>
        </div>`;
      }).join("")}</div>
    </section>` : ""}
    ${allList}`;
  bindSheetTable();

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
    if (retry) retry.onclick = async () => { await ScanQueue.retry(p.sheet); toast("ส่งตรวจใหม่แล้ว"); router(); };
    armButton($("[data-remove]", el), "ลบ?", async () => { await Store.del("sheets", p.sheet.id); router(); });
  }

  const imgs = new Map();
  for (const el of $$(".q-item")) {
    const it = items[el.dataset.i];
    const sh = it.info.sheet;
    if (!imgs.has(sh.id)) imgs.set(sh.id, await sheetImage(sh));
    $(".q-crop", el).appendChild(cellCrop(sh, imgs.get(sh.id), it.r, it.c, 96));
    const input = $(".q-input", el);
    const commit = async (val) => {
      const v = (val ?? input.value).trim().toUpperCase();
      if (!v) return toast("แตะตัวอักษร หรือพิมพ์ 1 ตัว A–Z");
      if (v !== "-" && !/^[A-Z]$/.test(v)) return toast("ใส่ได้ทีละ 1 ตัว A–Z");
      setCell(sh.result.reads[it.r][it.c], v === "-" ? "crossed" : v);
      await Store.put("sheets", sh);
      el.classList.add("done");
      const left = $$(".q-item:not(.done)");
      $("#left").textContent = left.length;
      const next = left.find((x) => +x.dataset.i > +el.dataset.i) || left[0];
      if (next) next.scrollIntoView({ block: "center", behavior: "smooth" });
      else setTimeout(router, 500);
    };
    input.addEventListener("input", () => (input.value = input.value.toUpperCase()));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); });
    $(".q-ok", el).onclick = () => commit();
    $$(".opt", el).forEach((b) => (b.onclick = () => commit(b.dataset.v)));
  }
}

// ---------- ③ คะแนน ----------
function paneScore(pane, ctx) {
  const { exam, classes, sum } = ctx;
  const rooms = [...new Set(sum.students.map((s) => s.room).filter(Boolean))];
  let room = "";
  const c = sum.counts;
  const w = exam.weight || null;
  const fix = c.problems + c.reviewCells;

  pane.innerHTML = `
    ${fix ? `<div class="notice">ยังมี ${fix} จุดที่ต้องตรวจ/แก้ — คะแนนอาจยังเปลี่ยน <a href="#/exam/${exam.id}/check">ไปแก้</a></div>` : ""}
    <section class="card send-card">
      <div>
        <h3>${exam.sentAt ? "ส่งคะแนนให้ฝ่ายวิชาการแล้ว" : "ส่งคะแนนให้ฝ่ายวิชาการ"}</h3>
        <p class="muted small">${exam.sentAt ? `ส่งเมื่อ ${esc(new Date(exam.sentAt).toLocaleString("th-TH"))} · แก้คะแนนแล้วส่งใหม่ได้` : "ได้ไฟล์ผลคะแนน 1 ไฟล์ — ส่งให้ฝ่ายวิชาการทางไลน์/อีเมล แล้วฝ่ายวิชาการกดนำเข้า"}</p>
      </div>
      <button id="send" class="primary big">${exam.sentAt ? "ส่งอีกครั้ง" : "สร้างไฟล์ส่งคะแนน"}</button>
    </section>
    <div class="row toolbar">
      ${rooms.length > 1 ? `<select id="room" aria-label="เลือกห้อง"><option value="">ทุกห้อง</option>${rooms.map((r) => `<option>${esc(r)}</option>`).join("")}</select>` : ""}
      <span class="spacer"></span>
      <button id="sgs" class="ghost">ไฟล์คะแนน (Excel) สำหรับ SGS / ปพ.5</button>
      <button id="print" class="ghost">พิมพ์</button>
    </div>
    <div id="stats"></div>
    <section class="card flush print-area">
      <div class="print-only print-head">
        <b>${esc(Settings.get().schoolName)}</b><br />
        <b>${esc(exam.name)}</b> — ${esc([exam.subjectCode, exam.subject].filter(Boolean).join(" "))} ${esc(classes.map((x) => x.name).join(", "))} · ${esc(termLabel(exam))} ${exam.date ? "· " + esc(thaiDate(exam.date)) : ""}
        <br />ครูผู้สอน ${esc(Settings.get().teacherName)}
      </div>
      <table class="table score-table" id="scores"></table>
    </section>
    <details class="card" id="items-wrap"><summary><b>วิเคราะห์รายข้อ</b> <span class="muted small">— ข้อไหนนักเรียนผิดเยอะ</span></summary><div id="items"></div></details>
    <details class="card"><summary><b>ไฟล์อื่นๆ</b></summary>
      <div class="row"><button id="csv" class="ghost">คะแนนรายข้อ (CSV)</button></div>
    </details>`;

  const render = () => {
    const list = sum.students.filter((s) => !room || s.room === room);
    const graded = list.filter((s) => s.sheets.length && s.max);
    const p = graded.map((s) => pct(s.score, s.max));
    const mean = p.length ? p.reduce((a, b) => a + b, 0) / p.length : 0;
    const full = graded[0]?.max || sum.fullMax(1);
    const avgScore = graded.length ? graded.reduce((s, x) => s + x.score, 0) / graded.length : 0;
    const scoreTxt = (sc, mx) => w ? `${fmt(recordedScore(sc, mx, w))}` : fmt(sc);

    $("#stats").innerHTML = `<div class="stats">
      <div class="stat"><b>${graded.length}<span class="muted">/${list.length}</span></b><span>คนที่มีคะแนน</span></div>
      <div class="stat"><b>${graded.length ? scoreTxt(avgScore, full) : "–"}<span class="muted">/${w || full}</span></b><span>คะแนนเฉลี่ย (${Math.round(mean)}%)</span></div>
      <div class="stat"><b>${graded.length ? scoreTxt(Math.max(...graded.map((s) => s.score)), full) : "–"}</b><span>สูงสุด</span></div>
      <div class="stat"><b>${graded.length ? scoreTxt(Math.min(...graded.map((s) => s.score)), full) : "–"}</b><span>ต่ำสุด</span></div>
    </div>`;

    $("#scores").innerHTML = `
      <thead><tr><th>เลขที่</th><th class="hide-sm">เลขประจำตัว</th><th>ชื่อ-สกุล</th>${rooms.length > 1 && !room ? "<th>ห้อง</th>" : ""}
        <th>ข้อที่ถูก</th>${w ? `<th>คะแนน (เต็ม ${fmt(w)})</th>` : ""}<th class="no-print">สถานะ</th></tr></thead>
      <tbody>${list.map((s) => {
        const st = STUDENT_STATUS[s.status];
        const href = s.sheets[0] ? `#/sheet/${s.sheets[s.sheets.length - 1].sheet.id}` : "";
        return `<tr ${href ? `data-href="${href}"` : ""} class="${s.status === "absent" ? "absent" : ""}">
          <td>${s.no ?? ""}</td><td class="mono hide-sm">${esc(s.sid)}</td><td>${esc(s.name)}</td>
          ${rooms.length > 1 && !room ? `<td>${esc(s.room)}</td>` : ""}
          <td class="mono">${s.sheets.length ? `<b>${fmt(s.score)}</b><span class="muted">/${s.max || full}</span>` : "–"}</td>
          ${w ? `<td class="mono"><b>${s.sheets.length ? fmt(recordedScore(s.score, s.max || full, w)) : "–"}</b></td>` : ""}
          <td class="no-print">${pill(st.cls, st.text + (s.status === "partial" ? ` (หน้า ${s.missingPages.join(",")})` : ""))}</td>
        </tr>`;
      }).join("")}</tbody>`;
    $$("#scores tr[data-href]").forEach((tr) => (tr.onclick = () => (location.hash = tr.dataset.href)));

    const nQ = (exam.pages || 1) * ROWS;
    const stats = Array.from({ length: nQ }, (_, q) => ({ q: q + 1, n: 0, right: 0 }));
    graded.forEach((s) => s.sheets.forEach((i) => i.grade.rows.forEach((r) => { if (r.max) { stats[r.q - 1].n++; stats[r.q - 1].right += r.points; } })));
    const shown = stats.filter((x) => x.n);
    $("#items").innerHTML = shown.length ? `
      <p class="muted small">% นักเรียนที่ตอบถูก · ข้อสีแดง (ต่ำกว่า 40%) อาจเป็นข้อยาก หรือ<b>เฉลยผิด</b> — ลองเช็คเฉลยข้อนั้นอีกครั้ง</p>
      <div class="items">${shown.map((it) => { const v = pct(it.right, it.n); return `
        <div class="item-row ${v < 40 ? "hard" : ""}"><span class="mono">ข้อ ${it.q}</span><div class="bar"><i style="width:${v}%"></i></div><span class="mono">${v}%</span></div>`; }).join("")}</div>`
      : `<p class="muted">ยังไม่มีคะแนน</p>`;
  };
  render();
  const sel = $("#room");
  if (sel) sel.onchange = () => { room = sel.value; render(); };

  const fname = (suffix) => [exam.subjectCode, exam.name, room, suffix].filter(Boolean).join("_").replace(/[\\/:*?"<>|]/g, "");
  $("#print").onclick = () => window.print();
  $("#sgs").onclick = () => {
    const list = sum.students.filter((s) => !room || s.room === room);
    const lines = [csvRow(["ห้อง", "เลขที่", "เลขประจำตัว", "ชื่อ-สกุล", w ? `คะแนน (เต็ม ${w})` : "คะแนน", "หมายเหตุ"])];
    for (const s of list) {
      const val = !s.sheets.length ? "" : w ? fmt(recordedScore(s.score, s.max, w)) : fmt(s.score);
      lines.push(csvRow([s.room, s.no ?? "", s.sid, s.name, val, s.status === "absent" ? "ขาดสอบ/ยังไม่ส่ง" : s.status === "partial" ? "ขาดบางหน้า" : ""]));
    }
    download(`${fname("คะแนน")}.csv`, "﻿" + lines.join("\r\n"), "text/csv");
  };
  $("#csv").onclick = () => {
    const nQ = (exam.pages || 1) * ROWS;
    const list = sum.students.filter((s) => !room || s.room === room);
    const lines = [csvRow(["ห้อง", "เลขที่", "เลขประจำตัว", "ชื่อ-สกุล", "ชุด", "ข้อที่ถูก", "จำนวนข้อ", ...Array.from({ length: nQ }, (_, i) => `ข้อ${i + 1}`)])];
    for (const s of list) {
      const perQ = Array(nQ).fill("");
      s.sheets.forEach((i) => i.grade.rows.forEach((r) => { if (r.max) perQ[r.q - 1] = fmt(r.points); }));
      lines.push(csvRow([s.room, s.no ?? "", s.sid, s.name, s.set ?? "", s.sheets.length ? fmt(s.score) : "", s.max || "", ...perQ]));
    }
    download(`${fname("รายข้อ")}.csv`, "﻿" + lines.join("\r\n"), "text/csv");
  };
  $("#send").onclick = async () => {
    const data = Transfer.resultsFile(ctx);
    download(`ส่งคะแนน_${fname("")}.json`, JSON.stringify(data), "application/json");
    exam.sentAt = Date.now();
    await Store.put("exams", exam);
    if (Settings.get().role === "admin") await Transfer.importResults(data); // เครื่องเดียวกัน → เข้าภาพรวมเลย
    toast("สร้างไฟล์แล้ว — ส่งไฟล์นี้ให้ฝ่ายวิชาการ");
    router();
  };
}
