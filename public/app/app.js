// app/app.js — แอปครูผู้สอน — ต้องเข้าสู่ระบบก่อน · แท็บล่าง: สร้างข้อสอบ · ตรวจข้อสอบ · ตั้งค่า
// ตรวจข้อสอบ 3 ขั้น: 1 ถ่ายภาพ → 2 ครอบภาพ → 3 ตรวจข้อสอบ (ทีละหลายแผ่นได้ · รองรับไฟล์ iPhone ผ่าน photos.js)
//
// ใช้ระบบเดิมของ Prame (อยู่ใน shared/):
//   store.js    — Store (IndexedDB: ข้อสอบ + กระดาษคำตอบพร้อมรูป → รีเฟรช/ปิดแอปแล้วไม่หาย) · Settings (เกณฑ์ตรวจ + ระบบตรวจ)
//   (ยังไม่ได้ต่อโมเดลจริง — engine ชุดเก่าถูกเอาออกแล้ว รอต่อโมเดลใหม่ของ Prame ที่ runModels) [claude/gelatin · 2026-10-28]
//   pipeline.js — mockResult (ผลอ่านจำลอง: ใช้กับรูปตัวอย่าง และเมื่อตั้งค่าเป็นโหมดจำลอง)
//                 Grade (ให้คะแนนตามเกณฑ์ตรวจ + ข้อที่ระบบไม่แน่ใจ)

const Mobile = (() => {
  const TABS = [
    ["#/exams", "ข้อสอบของฉัน", "pencil"],
    ["#/check", "ตรวจข้อสอบ", "check"],
    ["#/settings", "ตั้งค่า", "gear"],
  ];
  const STEPS = [["photo", "ถ่ายภาพ"], ["crop", "ครอบภาพ"], ["grade", "ตรวจข้อสอบ"]];
  const MAX_Q = 20, MAX_BOX = 20;
  const FORMAT = 2; // ข้อมูลของหน้าใหม่ (แยกจากข้อมูลหน้าเดิมของ Prame ที่อยู่ใน IndexedDB เดียวกัน)

  // ---------- ข้อมูล ----------
  // ข้อสอบ: { id, format, name, key: ["APPLE", …], createdAt }
  // กระดาษ: { id, format, examId, image: Blob, w, h, name, guess, corners, done: ครอบแล้ว, result, overrides, studentId, saved, createdAt }
  const Data = (() => {
    const sheets = new Map(), urls = new Map();
    let ready = null, classes = [];
    const loadClasses = async () => { classes = await Store.all("classes"); };
    const load = () => (ready ||= (async () => {
      // ย้ายข้อสอบจากต้นแบบรอบก่อน (localStorage) เข้า IndexedDB
      const old = Local.get("examer.proto.exams", null);
      if (old) { for (const e of old) await Store.put("exams", { id: e.id, format: FORMAT, name: e.name, key: e.key, createdAt: e.createdAt }); Local.del("examer.proto.exams"); }
      for (const s of await Store.all("sheets")) if (s.format === FORMAT) sheets.set(s.id, s);
      await loadClasses();
    })());
    const byTime = (a, b) => a.createdAt - b.createdAt;
    const NO_IMG = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 4"><rect width="3" height="4" fill="#d5dde2"/></svg>');
    const blobUrl = (k, b) => { if (!b) return NO_IMG; if (!urls.has(k)) urls.set(k, URL.createObjectURL(b)); return urls.get(k); };
    const dropUrls = (id) => { for (const k of [...urls.keys()]) if (k.startsWith(id + ":")) { URL.revokeObjectURL(urls.get(k)); urls.delete(k); } };
    return {
      load,
      classes: () => classes,                 // ห้อง + รายชื่อ (จากฝ่ายวิชาการ / Dashboard ในเครื่องเดียวกัน)
      reloadClasses: loadClasses,
      async exams() { return (await Store.all("exams")).filter((e) => e.format === FORMAT).map(normExam).sort((a, b) => b.createdAt - a.createdAt); },
      async exam(id) { const e = await Store.get("exams", id); return e?.format === FORMAT ? normExam(e) : null; },
      saveExam: (e) => Store.put("exams", { ...e, format: FORMAT }),
      async delExam(id) { for (const s of this.sheetsOf(id)) await this.delSheet(s.id); await Store.del("exams", id); },
      sheetsOf: (examId) => [...sheets.values()].filter((s) => s.examId === examId).sort(byTime),
      pending(examId) { return this.sheetsOf(examId).filter((s) => !s.saved); },
      saved(examId) { return this.sheetsOf(examId).filter((s) => s.saved); },
      all: () => [...sheets.values()].sort(byTime),
      sheet: (id) => sheets.get(id),
      putSheet(s) { sheets.set(s.id, s); const { run, ...plain } = s; return Store.put("sheets", plain); }, // run = สถานะชั่วคราว ไม่เก็บ
      async delSheet(id) { dropUrls(id); sheets.delete(id); await Store.del("sheets", id); },
      dropUrls,
      // รูปเต็ม (ครอบภาพ / หน้าตรวจ) · รูปย่อ (รายการ — ไม่ถอดรหัสรูป 3000px ทีละหลายสิบรูป) · ไม่มีรูป (ลบเพื่อประหยัดที่ / กู้จากไฟล์สำรอง) = ภาพว่าง
      url(s) { return blobUrl(s.id + ":i", s.image); },
      thumb(s) { return s.thumb ? blobUrl(s.id + ":t", s.thumb) : this.url(s); },
      handUrl(s) { return blobUrl(s.id + ":h", s.hand); },
      async clear() { for (const e of await this.exams()) await this.delExam(e.id); },
    };
  })();
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const KINDS = [["quiz", "สอบย่อย"], ["midterm", "กลางภาค"], ["final", "ปลายภาค"]];
  const kindLabel = (k) => KINDS.find(([v]) => v === k)?.[1] || "";
  // ข้อสอบจากต้นแบบรอบก่อน ({ key: [...] }) → รูปแบบใหม่ ({ n, sets, keys: {1,2,3}, points })
  function normExam(e) {
    if (e.keys) { if (e.sets > 3) { e.sets = 3; delete e.keys[4]; } return e; } // ข้อสอบเก่าที่มี 4 ชุด → เหลือ 3 [claude/gelatin · 2026-10-28]
    const key = e.key || [];
    return { ...e, n: key.length, sets: 1, keys: { 1: key, 2: [], 3: [] }, points: key.map(() => 1), scaleTo: null, kind: "quiz", rooms: [] };
  }
  const examMax = (e) => e.points.reduce((a, p) => a + p, 0);

  // ---------- คะแนน (เกณฑ์ตรวจของ Prame: Grade ใน pipeline.js) ----------
  const asExam = (exam) => ({ keys: Object.fromEntries([1, 2, 3].map((s) => [s, s <= exam.sets ? exam.keys[s] || [] : []])) });
  // คะแนนต่อข้อ = (ถูกทั้งคำ 1 / ได้บางส่วน 0–1 ตามเกณฑ์) × คะแนนของข้อนั้น — อยู่ใน shared/school.js (Dashboard ใช้คิดคะแนนเหมือนกัน)
  const gradeOf = (s, exam) => gradeExamSheet(s, exam);
  const num = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const thaiDate = (iso) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }); } catch { return iso; } };
  const studentOf = sheetStudentId;
  // นักเรียนในรายชื่อห้องที่สอบ ที่ตรงกับเลขประจำตัวของแผ่นนี้ (ไม่มีรายชื่อ = null)
  const rosterOf = (exam) => examRoster(exam, Data.classes());
  const studentMatch = (s, exam) => { const k = Roster.norm(studentOf(s)); return k ? rosterOf(exam).find((x) => Roster.norm(x.sid) === k) || null : null; };
  const isCentral = (e) => !!e.central;
  // บันทึกลงเครื่องไม่ได้ (พื้นที่เต็ม) → บอกครูว่าต้องทำอะไร
  const storageError = (err, notSaved = 0) => err?.name === "QuotaExceededError" || /quota/i.test(err?.message || "")
    ? `พื้นที่ในเครื่องเต็ม${notSaved ? ` — ยังไม่ได้เก็บ ${notSaved} รูป` : ""} · ลบรูปของการสอบที่ส่งคะแนนแล้ว (หน้าข้อสอบ › ลบรูปกระดาษ) แล้วลองใหม่`
    : `บันทึกไม่สำเร็จ: ${err?.message || err}`;

  // ---------- โครงหน้า ----------
  const view = (html, { title = "", back = "", tabs = true, extra = "" } = {}) => {
    $("#m-bar").innerHTML = (back
      ? `<a class="m-back" href="${back}" aria-label="กลับ">${ico("back")}</a><h1 class="m-title sm">${esc(title)}</h1>`
      : `<h1 class="m-title">${esc(title)}</h1>`) + extra;
    $("#m-bar").hidden = !title;
    $("#tabs").hidden = !tabs;
    $("#m-main").innerHTML = html;
    scrollTo(0, 0);
    const hash = location.hash;
    const tabOf = (h) => (/^#\/(exams|edit)/.test(h) ? "#/exams" : /^#\/(check|exam\/|sheet)/.test(h) ? "#/check" : h);
    $$("#tabs a").forEach((a) => a.classList.toggle("active", tabOf(hash) === a.getAttribute("href")));
  };

  // ต้องเข้าสู่ระบบก่อนทุกหน้า · โหลดข้อมูลจาก IndexedDB ก่อนวาดหน้า
  const guard = (fn) => async (...args) => {
    document.documentElement.classList.toggle("no-scroll", !Session.user());
    if (!Session.user()) { loginScreen(); return; }
    await Data.load();
    await Data.reloadClasses(); // Dashboard ในเว็บเดียวกันอาจเพิ่มรายชื่อไว้
    return fn(...args);
  };

  // ---------- เข้าสู่ระบบ (หน้าเดียวจบ ไม่เลื่อนจอ) ----------
  function loginScreen() {
    view(`<div class="m-login">
        <div class="m-login-brand">${LOGO}<h1>Examer</h1><p>ตรวจกระดาษคำตอบข้อเขียน</p></div>
      </div>`, { tabs: false });
    $(".m-login").append(loginForm({
      title: "",
      hint: "",
      onDone: () => { location.hash = "#/check"; Router.go(); },
    }));
  }

  // ---------- ข้อสอบของฉัน + สร้าง/แก้ไขข้อสอบ ----------
  // สร้างใหม่ / ร่าง: ทีละขั้น การสอบ → เฉลย → คะแนน (ปุ่ม "ถัดไป" ด้านล่าง · ย้อนกลับด้านบน)
  // ข้อสอบที่ใช้อยู่แล้ว: หน้ารวม 3 หัวข้อ → แตะเข้าไปแก้ → "บันทึกการแก้ไข"
  // ข้อสอบ.status: "draft" (ร่าง ยังตรวจไม่ได้) | "ready" · ข้อสอบ.work = ฉบับที่กำลังแก้ (บันทึกอัตโนมัติ) → กดบันทึกถึงจะใช้จริง
  const FIELDS = ["name", "subject", "subjectCode", "kind", "date", "rooms", "n", "sets", "keys", "points", "scaleTo"];
  const ALL_SETS = [1, 2, 3]; // ไม่เกิน 3 ชุด [claude/gelatin · 2026-10-28]
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const blankWork = () => ({ name: "", subject: "", subjectCode: "", kind: "quiz", date: today(), rooms: [], n: 10, sets: 1, keys: { 1: [], 2: [], 3: [] }, points: [], scaleTo: null });
  const isReady = (e) => e.status !== "draft";
  const COUNTS = [5, 10, 15, 20];
  const PARTS = [["info", "การสอบ"], ["keys", "เฉลย"], ["score", "คะแนน"]];
  const editState = {}; // { [id]: { set: ชุดที่กำลังใส่เฉลย, custom: เลือกจำนวนข้อเอง } }

  const workOf = (e) => {
    const w = structuredClone(e.work || Object.fromEntries(FIELDS.map((k) => [k, e[k]])));
    for (const s of ALL_SETS) w.keys[s] ||= [];
    w.rooms ||= [];
    for (let i = 0; i < w.n; i++) w.points[i] ??= 1;
    return w;
  };
  const keysDone = (w, s) => w.keys[s].slice(0, w.n).filter(Boolean).length;
  const status = (w) => ({
    info: !!w.name.trim(),
    keys: ALL_SETS.slice(0, w.sets).every((s) => keysDone(w, s) === w.n),
    score: w.points.slice(0, w.n).reduce((a, p) => a + p, 0) > 0,
  });
  const sameAsSaved = (e, w) => isReady(e) && FIELDS.every((k) => JSON.stringify(e[k]) === JSON.stringify(w[k]));
  const isEmptyDraft = (e, w) => !isReady(e) && !w.name.trim() && !w.subject && !ALL_SETS.some((s) => keysDone(w, s));
  async function saveWork(e, w) { e.work = w; e.updatedAt = Date.now(); await Data.saveExam(e); }

  // ใช้ฉบับที่แก้ (ต้องครบทุกหัวข้อ) — ไม่ครบ → บอกว่าขาดอะไรแล้วพาไปหน้านั้น
  async function commit(e, w) {
    const st = status(w);
    const miss = !st.info ? ["info", "ใส่ชื่อการสอบก่อน"] : !st.keys ? ["keys", "ใส่เฉลยให้ครบทุกข้อก่อน"] : !st.score ? ["score", "คะแนนรวมต้องมากกว่า 0"] : null;
    if (miss) { toast(miss[1]); if (!location.hash.endsWith("/" + miss[0])) location.hash = `#/edit/${e.id}/${miss[0]}`; return; }
    const checked = isReady(e) ? Data.saved(e.id).length : 0;
    Object.assign(e, structuredClone(w), { status: "ready", updatedAt: Date.now() });
    e.points = e.points.slice(0, e.n);
    for (const s of ALL_SETS) e.keys[s] = s <= e.sets ? e.keys[s].slice(0, e.n) : [];
    delete e.work; delete e.key;
    await Data.saveExam(e);
    toast(checked ? `บันทึกแล้ว คิดคะแนน ${checked} แผ่นใหม่ให้แล้ว` : "บันทึกข้อสอบแล้ว");
    location.hash = "#/exams";
  }

  // หน้าย่อยของการแก้ข้อสอบ: ร่าง = ขั้นตอนต่อกัน (ย้อน = ขั้นก่อนหน้า) · ข้อสอบที่ใช้อยู่ = กลับหน้ารวม
  function partOpts(e, part) {
    const i = PARTS.findIndex(([k]) => k === part);
    if (isReady(e)) return { title: PARTS[i][1], back: `#/edit/${e.id}`, tabs: false };
    return { title: PARTS[i][1], back: i ? `#/edit/${e.id}/${PARTS[i - 1][0]}` : "#/exams", tabs: false, extra: `<span class="wiz" aria-label="ขั้นที่ ${i + 1} จาก 3">${PARTS.map((_, j) => `<i class="${j <= i ? "on" : ""}"></i>`).join("")}</span>` };
  }
  function wizardBar(e, w, part) {
    if (isReady(e)) return "";
    const i = PARTS.findIndex(([k]) => k === part);
    const last = i === PARTS.length - 1;
    return `<div class="wiz-bar">${last ? `<button class="btn primary block" id="commit">บันทึกข้อสอบ</button>`
      : `<a class="btn primary block" href="#/edit/${e.id}/${PARTS[i + 1][0]}">ถัดไป: ${PARTS[i + 1][1]}${ico("next")}</a>`}</div>`;
  }
  const bindWizard = (e, w) => { const b = $("#commit"); if (b) b.onclick = () => commit(e, w); };
  // ออกจากร่างที่ยังว่างเปล่า (ไม่ได้ไปหน้าอื่นของข้อสอบนี้) → ไม่ต้องเก็บ
  const dropIfEmpty = (e, w) => () => { if (isEmptyDraft(e, w) && !location.hash.startsWith(`#/edit/${e.id}`)) Data.delExam(e.id); };

  // ข้อสอบของฉัน
  async function myExams() {
    const xs = await Data.exams();
    view(`
      <a class="btn primary block" href="#/exams/new">${ico("plus")}สร้างข้อสอบใหม่</a>
      ${xs.length ? `<ul class="exam-list mine">${xs.map((e) => {
        const w = workOf(e);
        const tag = isCentral(e) ? `<span class="tag central">ข้อสอบกลาง</span>` : !isReady(e) ? `<span class="tag draft">ร่าง</span>` : e.work && !sameAsSaved(e, w) ? `<span class="tag edit">แก้ไขค้างไว้</span>` : "";
        return `<li><a href="#/edit/${e.id}${isReady(e) ? "" : "/info"}">
          <span class="ex-t"><b>${esc(w.name || "ข้อสอบไม่มีชื่อ")} ${tag}</b>
            <small>${esc([w.subject, kindLabel(w.kind), `${w.n} ข้อ`, w.sets > 1 && `${w.sets} ชุด`].filter(Boolean).join(" · "))}</small></span>
          ${ico("next")}
        </a></li>`;
      }).join("")}</ul>` : `
      <div class="m-empty">
        <div class="blank-grid sm" aria-hidden="true">${"<i></i>".repeat(6)}</div>
        <h2>ยังไม่มีข้อสอบ</h2>
        <p class="muted">สร้างข้อสอบ ใส่เฉลย แล้วไปถ่ายรูปกระดาษคำตอบที่แท็บตรวจข้อสอบ ทำไม่เสร็จก็เก็บเป็นร่างไว้ได้</p>
      </div>`}`, { title: "ข้อสอบของฉัน" });
  }

  async function newExam() {
    const e = { id: uid(), status: "draft", createdAt: Date.now(), ...blankWork(), work: blankWork() };
    await Data.saveExam(e);
    location.replace(`#/edit/${e.id}/info`);
  }

  // หน้ารวม (เฉพาะข้อสอบที่ใช้อยู่แล้ว)
  async function editHub(id) {
    const e = await Data.exam(id);
    if (!e) { location.hash = "#/exams"; return; }
    if (isCentral(e)) return centralHub(e);
    if (!isReady(e)) { location.replace(`#/edit/${id}/info`); return; }
    const w = workOf(e), st = status(w), changed = !!e.work && !sameAsSaved(e, w);
    const total = w.points.slice(0, w.n).reduce((a, p) => a + p, 0);
    const keyLine = w.sets > 1 ? ALL_SETS.slice(0, w.sets).map((s) => `ชุดที่ ${s} ${keysDone(w, s)}/${w.n}`).join(" · ") : `ใส่แล้ว ${keysDone(w, 1)}/${w.n} ข้อ`;
    const row = (part, title, sub, ok) => `
      <li><a href="#/edit/${id}/${part}">
        <span class="hub-ok ${ok ? "ok" : ""}" aria-label="${ok ? "ครบแล้ว" : "ยังไม่ครบ"}">${ok ? "✓" : ""}</span>
        <span class="ex-t"><b>${title}</b><small>${esc(sub)}</small></span>${ico("next")}
      </a></li>`;
    const checked = Data.saved(id).length;
    view(`
      <div class="hub">
        <ul class="hub-list">
          ${row("info", "การสอบ", [w.name || "ยังไม่มีชื่อ", w.subject, kindLabel(w.kind), w.date && thaiDate(w.date)].filter(Boolean).join(" · "), st.info)}
          ${row("keys", "เฉลย", `${w.n} ข้อ · ${keyLine}`, st.keys)}
          ${row("score", "คะแนน", `รวม ${num(total)} คะแนน${w.scaleTo ? ` · คิดเป็น ${num(w.scaleTo)}` : ""}`, st.score)}
        </ul>
        ${checked && changed ? `<p class="review-note">ตรวจไปแล้ว ${checked} แผ่น — บันทึกแล้วระบบจะคิดคะแนนทุกแผ่นใหม่</p>` : ""}
        <div class="hub-actions">
          <button class="btn primary block" id="save" ${changed ? "" : "disabled"}>บันทึกการแก้ไข</button>
          <p class="small muted center">${changed ? "มีการแก้ไขที่ยังไม่บันทึก" : "ยังไม่มีการแก้ไข"}</p>
          ${changed ? `<button class="link" id="discard">ยกเลิกการแก้ไข</button>` : ""}
          <button class="link danger-link" id="del">${ico("trash")}ลบข้อสอบนี้</button>
        </div>
      </div>`, { title: "แก้ไขข้อสอบ", back: "#/exams", tabs: false });

    $("#save").onclick = () => commit(e, w);
    const dis = $("#discard");
    if (dis) dis.onclick = async () => { delete e.work; await Data.saveExam(e); toast("ยกเลิกการแก้ไขแล้ว"); editHub(id); };
    armButton($("#del"), "แตะอีกครั้งเพื่อลบข้อสอบ", async () => { await Data.delExam(id); toast("ลบข้อสอบแล้ว"); location.hash = "#/exams"; });
  }

  // ข้อสอบกลาง (จากฝ่ายวิชาการ): ดูได้อย่างเดียว · เฉลยแก้ที่ Dashboard แล้วส่งไฟล์ใหม่
  function centralHub(e) {
    const keyLine = ALL_SETS.slice(0, e.sets).map((s) => `ชุดที่ ${s}: ${e.keys[s].length} ข้อ`).join(" · ");
    const total = e.points.reduce((a, p) => a + p, 0);
    view(`
      <div class="hub">
        <p class="review-note central-note">ข้อสอบกลางจากฝ่ายวิชาการ — ครูทุกห้องใช้เฉลยเดียวกัน แก้ในแอปไม่ได้ ถ้าเฉลยผิดให้แจ้งฝ่ายวิชาการ</p>
        <ul class="hub-list ro">
          <li><span class="ex-t"><b>การสอบ</b><small>${esc([e.name, [e.subjectCode, e.subject].filter(Boolean).join(" "), kindLabel(e.kind), e.date && thaiDate(e.date), e.rooms?.join(", ")].filter(Boolean).join(" · "))}</small></span></li>
          <li><span class="ex-t"><b>เฉลย</b><small>${esc(`${e.n} ข้อ · ${keyLine}`)}</small></span></li>
          <li><span class="ex-t"><b>คะแนน</b><small>${esc(`รวม ${num(total)} คะแนน${e.scaleTo ? ` · คิดเป็น ${num(e.scaleTo)}` : ""}`)}</small></span></li>
        </ul>
        <a class="btn primary block" href="#/exam/${e.id}">${ico("camera")}ไปตรวจข้อสอบนี้</a>
      </div>`, { title: "ข้อสอบกลาง", back: "#/exams", tabs: false });
  }

  // ขั้น / หัวข้อ 1: การสอบ
  async function editInfo(id) {
    const e = await Data.exam(id);
    if (!e) { location.hash = "#/exams"; return; }
    if (isCentral(e)) { location.replace(`#/edit/${id}`); return; }
    const w = workOf(e);
    view(`
      <form class="m-form fit" id="ef" novalidate>
        <label>ชื่อการสอบ<input name="name" value="${esc(w.name)}" placeholder="เช่น สอบย่อย Unit 3" autocomplete="off" /></label>
        <div class="two">
          <label>วิชา<input name="subject" value="${esc(w.subject)}" placeholder="เช่น ภาษาอังกฤษ 5" autocomplete="off" /></label>
          <label>รหัสวิชา<input name="subjectCode" value="${esc(w.subjectCode)}" placeholder="อ23101" autocomplete="off" /></label>
        </div>
        <div class="field"><span class="field-l">ประเภท</span>
          <div class="seg" role="radiogroup">${KINDS.map(([v, l]) => `<button type="button" data-kind="${v}" class="${w.kind === v ? "on" : ""}" role="radio" aria-checked="${w.kind === v}">${l}</button>`).join("")}</div>
        </div>
        <label>วันที่สอบ<input type="date" name="date" value="${esc(w.date || "")}" /></label>
        <div class="field"><span class="field-l">ห้องที่สอบ <small class="muted">พิมพ์แล้วกด Enter</small></span><div class="rooms" id="rooms"></div></div>
      </form>
      ${wizardBar(e, w, "info")}`, partOpts(e, "info"));

    const form = $("#ef");
    const save = () => { for (const k of ["name", "subject", "subjectCode", "date"]) w[k] = form[k].value.trim(); saveWork(e, w); };
    form.oninput = save;
    form.onsubmit = (ev) => ev.preventDefault();
    $$("[data-kind]").forEach((b) => (b.onclick = () => { w.kind = b.dataset.kind; $$("[data-kind]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); }); save(); }));
    const drawRooms = () => {
      $("#rooms").innerHTML = `${w.rooms.map((r, i) => `<span class="room">${esc(r)}<button type="button" data-rr="${i}" aria-label="เอา ${esc(r)} ออก">×</button></span>`).join("")}
        <input id="room-in" placeholder="${w.rooms.length ? "เพิ่มห้อง" : "เช่น ม.3/1"}" autocomplete="off" enterkeyhint="done" list="room-dl" />
        <datalist id="room-dl">${Data.classes().filter((c) => !w.rooms.includes(c.name)).map((c) => `<option value="${esc(c.name)}">`).join("")}</datalist>`;
      $$("[data-rr]").forEach((b) => (b.onclick = () => { w.rooms.splice(Number(b.dataset.rr), 1); save(); drawRooms(); }));
      const inp = $("#room-in");
      const add = () => { const v = inp.value.replace(/,/g, "").trim(); inp.value = ""; if (v && !w.rooms.includes(v)) w.rooms.push(v); save(); drawRooms(); $("#room-in").focus(); };
      // เลือกจากรายการห้อง (datalist) → เพิ่มทันที
      inp.oninput = (ev) => { ev.stopPropagation(); if ((!ev.inputType || ev.inputType === "insertReplacementText") && Data.classes().some((c) => c.name === inp.value)) add(); };
      inp.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === ",") { ev.preventDefault(); add(); } else if (ev.key === "Backspace" && !inp.value && w.rooms.length) { w.rooms.pop(); save(); drawRooms(); $("#room-in").focus(); } };
      inp.onblur = () => { if (inp.value.trim()) add(); };
    };
    drawRooms();
    bindWizard(e, w);
    return dropIfEmpty(e, w);
  }

  // ขั้น / หัวข้อ 2: เฉลย — จำนวนข้อ (5/10/15/20/ระบุ) · ชุด 1–4 (ปุ่มวงกลมบอกสถานะ) · ทุกข้อในหน้าเดียว + คะแนนต่อข้อ (−/+)
  async function editKeys(id) {
    const e = await Data.exam(id);
    if (!e) { location.hash = "#/exams"; return; }
    if (isCentral(e)) { location.replace(`#/edit/${id}`); return; }
    const w = workOf(e);
    const st = (editState[id] ||= { set: 1, custom: !COUNTS.includes(w.n) });
    st.set = Math.min(st.set, w.sets);
    view(`<div class="keys-page">
        <div class="field"><span class="field-l">จำนวนข้อ</span><div class="count-row" id="counts"></div></div>
        <div class="field"><span class="field-l">ชุดข้อสอบ</span><div class="set-row" id="sets"></div></div>
        <div id="qs"></div>
      </div>
      ${wizardBar(e, w, "keys")}`, partOpts(e, "keys"));

    const save = () => saveWork(e, w);
    function drawCounts() {
      $("#counts").innerHTML = `${COUNTS.map((c) => `<button type="button" class="cnt ${!st.custom && w.n === c ? "on" : ""}" data-n="${c}" aria-pressed="${!st.custom && w.n === c}">${c}</button>`).join("")}
        <span class="cnt-custom ${st.custom ? "on" : ""}" role="group" aria-label="ระบุจำนวนข้อเอง">
          <button type="button" class="icon-btn sm" data-cd="-1" aria-label="ลดจำนวนข้อ">−</button>
          ${st.custom ? `<output>${w.n}</output>` : `<button type="button" class="cnt-l" data-cd="0">ระบุ</button>`}
          <button type="button" class="icon-btn sm" data-cd="1" aria-label="เพิ่มจำนวนข้อ">${ico("plus")}</button>
        </span>`;
      const setN = (n) => { w.n = Math.min(MAX_Q, Math.max(1, n)); for (let i = 0; i < w.n; i++) w.points[i] ??= 1; save(); drawCounts(); drawSets(); drawQs(); };
      $$("[data-n]").forEach((b) => (b.onclick = () => { st.custom = false; setN(Number(b.dataset.n)); }));
      $$("[data-cd]").forEach((b) => (b.onclick = () => { const d = st.custom ? Number(b.dataset.cd) : 0; st.custom = true; setN(w.n + d); }));
    }
    // ปุ่มชุด: วงกลมแบบช่อง "ชุด" บนกระดาษคำตอบ · เส้นรอบวง = ใส่เฉลยไปแล้วกี่ % · ทึบ+ขอบทอง = ชุดที่กำลังใส่ · เส้นประ+ = ยังไม่ได้เพิ่ม
    function drawSets() {
      $("#sets").innerHTML = ALL_SETS.map((s) => {
        const on = s <= w.sets, cur = s === st.set, pct = on ? (keysDone(w, s) / w.n) * 100 : 0;
        const label = !on ? `เพิ่มชุดที่ ${s}` : `ชุดที่ ${s} ใส่เฉลยแล้ว ${keysDone(w, s)} จาก ${w.n} ข้อ${cur ? " (กำลังใส่)" : ""}`;
        return `<button type="button" class="setc ${on ? "on" : "off"} ${cur ? "cur" : ""}" data-s="${s}" style="--p:${pct}" aria-label="${label}" title="${label}"><span>${s}</span></button>`;
      }).join("") + (w.sets > 1 ? `<button type="button" class="icon-btn sm set-del" id="set-del" aria-label="ลบชุดที่ ${st.set}" title="ลบชุดที่ ${st.set}">${ico("trash")}</button>` : "");
      $$("[data-s]").forEach((b) => (b.onclick = () => {
        const s = Number(b.dataset.s);
        if (s > w.sets) { w.sets = s; save(); } // เพิ่มชุด (ถึงชุดที่แตะ)
        st.set = s;
        drawSets(); drawQs();
      }));
      const del = $("#set-del");
      if (del) del.onclick = async () => {
        const s = st.set, filled = keysDone(w, s);
        // ชุดว่าง → ลบเลย · มีเฉลยแล้ว → ถามก่อน
        if (filled && !(await confirmSheet({ title: `ลบชุดที่ ${s}?`, body: `เฉลยที่ใส่ไว้ ${filled} ข้อของชุดนี้จะหายไป${s < w.sets ? ` · ชุดที่ ${s + 1}${s + 1 < w.sets ? "–" + w.sets : ""} จะเลื่อนขึ้นมาแทน` : ""}`, ok: "ลบชุดนี้" }))) return;
        for (let k = s; k < w.sets; k++) w.keys[k] = w.keys[k + 1];
        w.keys[w.sets] = [];
        w.sets -= 1;
        st.set = Math.min(s, w.sets);
        save(); drawSets(); drawQs();
        toast(`ลบชุดที่ ${s} แล้ว`);
      };
    }
    function drawQs() {
      const key = w.keys[st.set];
      $("#qs").innerHTML = `
        <ol class="qa-list">${Array.from({ length: w.n }, (_, i) => `
          <li>
            <span class="q">${i + 1}</span>
            <input class="qa-in" data-q="${i}" value="${esc(key[i] || "")}" maxlength="${MAX_BOX}" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="next" placeholder="เฉลยข้อ ${i + 1}" aria-label="เฉลย${w.sets > 1 ? `ชุดที่ ${st.set} ` : ""}ข้อ ${i + 1}" />
            <span class="pts" role="group" aria-label="คะแนนข้อ ${i + 1}">
              <button type="button" data-pd="-1" data-q="${i}" aria-label="ลดคะแนนข้อ ${i + 1}">−</button><output>${num(w.points[i])}</output><button type="button" data-pd="1" data-q="${i}" aria-label="เพิ่มคะแนนข้อ ${i + 1}">+</button>
            </span>
          </li>`).join("")}
        </ol>
        <p class="small muted">ตัวอักษร A–Z ไม่เกิน ${MAX_BOX} ตัวต่อข้อ · คะแนนข้อละ 1 ถ้าไม่ปรับ</p>`;
      $$(".qa-in").forEach((inp) => {
        inp.oninput = () => {
          inp.value = inp.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, MAX_BOX);
          w.keys[st.set][Number(inp.dataset.q)] = inp.value;
          save(); drawSets();
        };
        inp.onkeydown = (ev) => { // Enter → ข้อถัดไป
          if (ev.key !== "Enter") return;
          ev.preventDefault();
          const next = $(`.qa-in[data-q="${Number(inp.dataset.q) + 1}"]`);
          if (next) next.focus(); else inp.blur();
        };
      });
      $$("[data-pd]").forEach((b) => (b.onclick = () => {
        const i = Number(b.dataset.q);
        w.points[i] = Math.min(10, Math.max(1, (w.points[i] || 1) + Number(b.dataset.pd)));
        b.parentElement.querySelector("output").textContent = num(w.points[i]);
        save();
      }));
    }
    drawCounts(); drawSets(); drawQs();
    bindWizard(e, w);
  }

  // ขั้น / หัวข้อ 3: คะแนน
  async function editScore(id) {
    const e = await Data.exam(id);
    if (!e) { location.hash = "#/exams"; return; }
    if (isCentral(e)) { location.replace(`#/edit/${id}`); return; }
    const w = workOf(e);
    const total = () => w.points.slice(0, w.n).reduce((a, p) => a + p, 0);
    view(`<div class="m-form fit">
        <section class="score-box">
          <span>คะแนนรวม</span><b>${num(total())}</b><small class="muted">${w.n} ข้อ · ปรับคะแนนรายข้อได้ที่หน้าเฉลย</small>
        </section>
        <div class="field"><span class="field-l">คิดเป็นคะแนนเต็ม <small class="muted">(ไม่บังคับ)</small></span>
          <div class="scale-row">
            <button type="button" class="icon-btn" data-sd="-1" aria-label="ลด">−</button>
            <input id="scale" type="number" inputmode="decimal" min="1" step="1" value="${w.scaleTo ?? ""}" placeholder="${num(total())}" aria-label="คิดเป็นคะแนนเต็ม" />
            <button type="button" class="icon-btn" data-sd="1" aria-label="เพิ่ม">${ico("plus")}</button>
          </div>
          <p class="small muted">ใช้ตอนบันทึกลงคะแนนเก็บ เช่น สอบ 20 ข้อ คิดเป็น 10 คะแนน · เว้นว่าง = ใช้คะแนนรวม</p>
        </div>
      </div>
      ${wizardBar(e, w, "score")}`, partOpts(e, "score"));
    const inp = $("#scale");
    const set = (v) => { w.scaleTo = v > 0 ? v : null; inp.value = w.scaleTo ?? ""; saveWork(e, w); };
    inp.oninput = () => { w.scaleTo = inp.value ? Number(inp.value) : null; saveWork(e, w); };
    $$("[data-sd]").forEach((b) => (b.onclick = () => set((w.scaleTo ?? total()) + Number(b.dataset.sd))));
    bindWizard(e, w);
  }

  // หน้าต่างถามซ้ำ (แทน confirm() ของเบราว์เซอร์)
  function confirmSheet({ title, body, ok = "ตกลง", cancel = "ยกเลิก" }) {
    return new Promise((done) => {
      const el = document.createElement("div");
      el.className = "sheet-wrap";
      el.innerHTML = `<div class="sheet" role="alertdialog" aria-modal="true" aria-labelledby="sh-t" aria-describedby="sh-b">
          <h2 id="sh-t">${esc(title)}</h2><p id="sh-b">${esc(body)}</p>
          <div class="sheet-act"><button class="btn ghost" data-r="0">${esc(cancel)}</button><button class="btn danger" data-r="1">${esc(ok)}</button></div>
        </div>`;
      const close = (r) => { el.remove(); document.removeEventListener("keydown", onKey); done(r); };
      const onKey = (ev) => { if (ev.key === "Escape") close(false); };
      el.onclick = (ev) => { if (ev.target === el) close(false); const b = ev.target.closest("[data-r]"); if (b) close(b.dataset.r === "1"); };
      document.addEventListener("keydown", onKey);
      document.body.append(el);
      $("[data-r='0']", el).focus();
    });
  }

  // ---------- ตรวจข้อสอบ: รายการข้อสอบ ----------
  async function checkList() {
    const xs = (await Data.exams()).filter(isReady);
    view(xs.length ? `
      <p class="m-lead muted">เลือกข้อสอบที่จะตรวจ</p>
      <ul class="exam-list">${xs.map((e) => {
        const done = Data.saved(e.id).length, left = Data.pending(e.id).length;
        return `<li><a href="#/exam/${e.id}">
          <span class="ex-t"><b>${esc(e.name)}</b><small>${esc([e.subject, kindLabel(e.kind), `${e.n} ข้อ`].filter(Boolean).join(" · "))}</small>
            <small>ตรวจแล้ว ${done} แผ่น${left ? ` · <em>ค้าง ${left} แผ่น</em>` : ""}</small></span>
          ${ico("next")}
        </a></li>`;
      }).join("")}
      </ul>` : `
      <div class="m-empty">
        <div class="blank-grid sm" aria-hidden="true">${"<i></i>".repeat(6)}</div>
        <h2>ยังไม่มีข้อสอบที่พร้อมตรวจ</h2>
        <p class="muted">สร้างข้อสอบและใส่เฉลยให้ครบก่อน แล้วกลับมาถ่ายรูปกระดาษคำตอบที่นี่</p>
        <a class="btn primary" href="#/exams">${ico("pencil")}ไปที่ข้อสอบของฉัน</a>
      </div>`, { title: "ตรวจข้อสอบ" });
  }

  // ---------- หน้าข้อสอบ: คะแนนทุกแผ่น + ส่งออก ----------
  async function examView(id) {
    const exam = await Data.exam(id);
    if (!exam) { location.hash = "#/check"; return; }
    if (!isReady(exam)) { location.replace(`#/edit/${id}`); return; } // ร่าง → ไปหน้าแก้
    const saved = Data.saved(id), left = Data.pending(id).length;
    const gs = saved.map((s) => ({ s, g: gradeOf(s, exam), st: studentMatch(s, exam) }));
    const max = examMax(exam);
    const roster = rosterOf(exam);
    const sum = examScores(exam, saved, Data.classes());
    // มีรายชื่อ → นับเป็นคน (คนเดียวหลายแผ่น ใช้แผ่นล่าสุด) · ไม่มี → นับเป็นแผ่น
    const mean = roster.length ? sum.counts.mean ?? 0 : gs.length ? gs.reduce((a, x) => a + x.g.score, 0) / gs.length : 0;
    const kOf = (st) => (st ? st.room + ":" + Roster.norm(st.sid) : "");
    const dupOf = (st) => (st ? gs.filter((x) => kOf(x.st) === kOf(st)).length : 0);
    const latest = new Map(gs.map((x) => [kOf(x.st), x])); // แผ่นล่าสุดของแต่ละคน (gs เรียงตามเวลาที่ตรวจ)
    const absent = sum.rows.filter((r) => r.status === "absent");
    // เรียงตามเลขที่ถ้ามีรายชื่อ (แผ่นที่ไม่พบในรายชื่อไว้บนสุด ให้ครูเห็นก่อน) · ไม่มีรายชื่อ = ตามลำดับที่ตรวจ
    if (roster.length) gs.sort((a, b) => (!!a.st - !!b.st) || String(a.st?.room).localeCompare(String(b.st?.room), "th") || (a.st?.no ?? 0) - (b.st?.no ?? 0));
    const who = ({ s, st }, i) => st ? `<b>${st.no ? `${st.no}. ` : ""}${esc(st.name || st.sid)}</b>` : studentOf(s) ? `<b>เลขประจำตัว ${esc(studentOf(s))}</b>` : `<b>แผ่นที่ ${i + 1}</b>`;
    const sub = (x) => { const { s, g, st } = x; return [roster.length && !st ? `<em class="bad">${studentOf(s) ? "ไม่พบในรายชื่อ" : "อ่านเลขประจำตัวไม่ได้"}</em>` : st && exam.rooms.length > 1 ? esc(st.room) : "",
      dupOf(st) > 1 ? `<em class="bad">${latest.get(kOf(st)) === x ? `ซ้ำ ${dupOf(st)} แผ่น — ใช้แผ่นนี้` : "ซ้ำ — ไม่นับแผ่นนี้"}</em>` : "",
      g.review ? `<em>ระบบไม่แน่ใจ ${g.review} ข้อ</em>` : !roster.length || st ? "ตรวจแล้ว" : ""].filter(Boolean).join(" · "); };
    const meta = [exam.subjectCode && exam.subject ? `${exam.subjectCode} ${exam.subject}` : exam.subject || exam.subjectCode, kindLabel(exam.kind),
      exam.date && thaiDate(exam.date), exam.rooms?.length && exam.rooms.join(", "), exam.sets > 1 && `${exam.sets} ชุด`].filter(Boolean);
    view(`
      ${meta.length ? `<p class="ex-meta">${esc(meta.join(" · "))}</p>` : ""}
      <section class="ex-sum">
        <div><b>${roster.length ? `${sum.counts.scored - sum.counts.unknown}<small>/${roster.length}</small>` : saved.length}</b><span>${roster.length ? "ตรวจแล้ว (คน)" : "แผ่นที่ตรวจแล้ว"}</span></div>
        <div><b>${gs.length ? num(mean) : "–"}</b><span>คะแนนเฉลี่ย (เต็ม ${num(max)})</span></div>
      </section>
      ${exam.scaleTo ? `<p class="small muted ex-scale">${exam.n} ข้อ ${num(max)} คะแนน คิดเป็นคะแนนเต็ม ${num(exam.scaleTo)}${gs.length ? ` · เฉลี่ย ${num((mean * exam.scaleTo) / max)}` : ""}</p>` : ""}
      <a class="btn primary block" href="#/check/${id}/photo">${ico("camera")}${left ? `ตรวจต่อ (ค้าง ${left} แผ่น)` : "ตรวจข้อสอบ"}</a>
      <a class="btn ghost block" href="#/edit/${id}">${ico(isCentral(exam) ? "eye" : "pencil")}${isCentral(exam) ? "ดูข้อสอบกลาง" : "แก้ไขข้อสอบ"}</a>
      ${gs.length ? `
        <h2 class="sec-h">คะแนน</h2>
        <ul class="score-list">${gs.map((x, i) => `
          <li><a href="#/sheet/${x.s.id}">
            <img src="${Data.thumb(x.s)}" alt="" loading="lazy" decoding="async" />
            <span class="ex-t">${who(x, i)}<small>${sub(x)}</small></span>
            <span class="sc">${num(x.g.score)}/${num(x.g.max)}</span>
          </a></li>`).join("")}
        </ul>
        ${absent.length ? `<details class="absent"><summary>ยังไม่มีกระดาษ ${absent.length} คน</summary>
          <ul>${absent.map((r) => `<li><span>${r.no ? `${r.no}. ` : ""}${esc(r.name || r.sid)}</span><small>${esc(r.room)}</small></li>`).join("")}</ul></details>` : ""}
        <h2 class="sec-h">ส่งคะแนน</h2>
        <button class="btn primary block" id="send">${ico("upload")}ส่งคะแนนให้ฝ่ายวิชาการ</button>
        <button class="btn ghost block" id="csv">${ico("download")}ไฟล์สำหรับ SGS / ปพ.5 (CSV)</button>
        ${saved.some((x) => x.image) ? `<button class="link danger-link" id="free">${ico("trash")}ลบรูปกระดาษของการสอบนี้ (เก็บคะแนนไว้)</button>` : ""}
        <p class="small muted pad">${roster.length ? "เรียงตามห้องและเลขที่ นักเรียนที่ไม่มีกระดาษมีในไฟล์ด้วย (คะแนนว่าง)" : "ยังไม่มีรายชื่อนักเรียน — นำเข้าไฟล์จากฝ่ายวิชาการที่ ตั้งค่า จะได้ชื่อและเลขที่ในไฟล์"}</p>` : `<p class="muted center ex-none">ยังไม่มีกระดาษที่ตรวจแล้ว</p>`}
      <button class="link danger-link" id="del">${ico("trash")}ลบข้อสอบนี้</button>`, { title: exam.name, back: "#/check" });

    // ประหยัดพื้นที่: ส่งคะแนนแล้วลบรูปได้ คะแนนและผลอ่านยังอยู่ (แก้ผลได้ แต่ไม่เห็นรูป/ลายมือ)
    const free = $("#free");
    if (free) armButton(free, `แตะอีกครั้งเพื่อลบรูป ${saved.filter((x) => x.image).length} แผ่น`, async () => {
      for (const x of saved) { Data.dropUrls(x.id); Object.assign(x, { image: null, hand: null }); await Data.putSheet(x); }
      toast("ลบรูปแล้ว คะแนนยังอยู่ครบ");
      examView(id);
    });
    const csv = $("#csv");
    if (csv) csv.onclick = () => download(new Blob([scoresCsv(exam, sum.rows, sum.max)], { type: "text/csv" }), `คะแนน-${safeName(exam.name)}.csv`);
    // ยังไม่มี server → ได้ไฟล์ .json ส่งให้ฝ่ายวิชาการ (LINE / อีเมล / Drive) แล้วฝ่ายวิชาการนำเข้าที่ Dashboard
    const send = $("#send");
    if (send) send.onclick = async () => {
      const review = sum.counts.review + sum.counts.unknown;
      if (review && !(await confirmSheet({ title: "ยังมีแผ่นที่ต้องตรวจซ้ำ", body: `${review} คนยังมีข้อที่ระบบไม่แน่ใจหรือเลขประจำตัวไม่ตรงรายชื่อ ส่งไปก่อนแล้วส่งใหม่ทีหลังได้`, ok: "ส่งเลย", cancel: "กลับไปตรวจ" }))) return;
      const d = Transfer.resultsFile(exam, sum, Settings.get().teacherName || Session.user()?.name);
      const file = new File([JSON.stringify(d)], `examer-คะแนน-${safeName(exam.name)}.json`, { type: "application/json" });
      // มือถือ: เปิดเมนูแชร์ (ส่งทาง LINE ได้เลย) · ทำไม่ได้ → ดาวน์โหลดไฟล์
      try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: `คะแนน ${exam.name}` }); return; } } catch (err) { if (err.name === "AbortError") return; }
      download(file, file.name);
      toast("ได้ไฟล์คะแนนแล้ว — ส่งไฟล์นี้ให้ฝ่ายวิชาการ");
    };
    armButton($("#del"), "แตะอีกครั้งเพื่อลบข้อสอบและคะแนนทั้งหมด", async () => { await Data.delExam(id); toast("ลบข้อสอบแล้ว"); location.hash = "#/check"; });
  }

  // ---------- ดูผลแผ่นที่บันทึกแล้ว (แก้ได้) ----------
  async function sheetView(sid) {
    const s = Data.sheet(sid);
    const exam = s && await Data.exam(s.examId);
    if (!s || !exam) { location.hash = "#/check"; return; }
    view(`<div class="step-body"><div id="res"></div>
      <button class="link danger-link" id="del">${ico("trash")}ลบแผ่นนี้</button></div>`, { title: exam.name, back: `#/exam/${exam.id}`, tabs: false });
    resultPanel($("#res"), s, exam);
    armButton($("#del"), "แตะอีกครั้งเพื่อลบ", async () => { await Data.delSheet(sid); toast("ลบแผ่นแล้ว"); location.hash = `#/exam/${exam.id}`; });
  }

  // ---------- ตรวจข้อสอบ: 3 ขั้น (ทำทีละหลายแผ่นได้) ----------
  const curIdx = {}; // แผ่นที่เปิดอยู่ของแต่ละข้อสอบ (ขั้นครอบภาพ/ตรวจ)
  async function flow(id, step) {
    const exam = await Data.exam(id);
    if (!exam || !isReady(exam)) { location.hash = "#/check"; return; }
    const items = Data.pending(id);
    const at = STEPS.findIndex(([k]) => k === step);
    if (at > 0 && !items.length) { location.hash = `#/check/${id}/photo`; return; }            // ยังไม่มีรูป
    if (at > 1 && items.some((x) => !x.done)) { location.hash = `#/check/${id}/crop`; return; } // ยังครอบไม่ครบ

    const stepper = `<ol class="steps">${STEPS.map(([k, label], i) => {
      const cls = i < at ? "done" : i === at ? "now" : "";
      const inner = `<span class="dot">${i + 1}</span><span>${label}</span>`;
      return `<li class="${cls}">${i < at ? `<a href="#/check/${id}/${k}">${inner}</a>` : inner}</li>`;
    }).join("")}</ol>`;
    const opts = { title: exam.name, back: `#/exam/${id}`, tabs: false };
    if (step === "photo") return photoStep(exam, stepper, opts);
    if (step === "crop") return cropStep(exam, stepper, opts);
    return gradeStep(exam, stepper, opts);
  }

  const DEFAULT_CORNERS = [[0.1, 0.08], [0.9, 0.08], [0.9, 0.92], [0.1, 0.92]];

  // แถบรูปย่อ (ขั้นครอบภาพและตรวจ) · badge(x) = ป้ายมุมรูป
  const strip = (items, cur, badge) => items.length < 2 ? "" : `
    <div class="strip" role="tablist">${items.map((x, i) => `
      <button class="strip-i ${i === cur ? "now" : ""}" data-go="${i}" role="tab" aria-selected="${i === cur}" aria-label="แผ่นที่ ${i + 1}">
        <img src="${Data.thumb(x)}" alt="" decoding="async" /><span class="strip-n">${i + 1}</span>${badge(x)}
      </button>`).join("")}
    </div>`;

  // 1 ถ่ายภาพ — ถ่ายทีละแผ่นหรือเลือกจากคลังหลายรูปพร้อมกัน (เก็บลงเครื่องทันที)
  function photoStep(exam, stepper, opts) {
    const items = Data.pending(exam.id), n = items.length;
    view(`${stepper}
      <div class="step-body">
        ${n ? `
          <p class="m-lead"><b>${n} แผ่น</b> <span class="muted">แตะ × เพื่อเอารูปออก</span></p>
          <ul class="thumbs">${items.map((x, i) => `
            <li><img src="${Data.thumb(x)}" alt="แผ่นที่ ${i + 1}" loading="lazy" decoding="async" /><span class="strip-n">${i + 1}</span>
              <button class="thumb-x" data-rm="${x.id}" aria-label="เอาแผ่นที่ ${i + 1} ออก">×</button></li>`).join("")}
          </ul>` : `
          <div class="shot"><div class="shot-guide">${ico("camera")}<p>วางกระดาษบนพื้นเรียบ ถ่ายให้เห็นครบทั้งแผ่น ถ่ายต่อกันได้หลายแผ่น</p></div></div>`}
        <p class="busy" id="busy" hidden></p>
        <div class="step-actions">
          <div class="pick-row">
            <label class="btn ${n ? "ghost" : "primary"}">${ico("camera")}${n ? "ถ่ายเพิ่ม" : "ถ่ายรูป"}<input type="file" accept="${Photos.ACCEPT}" capture="environment" hidden data-pick /></label>
            <label class="btn ghost">${ico("image")}${n ? "เลือกเพิ่ม" : "เลือกจากคลังภาพ"}<input type="file" accept="${Photos.ACCEPT}" multiple hidden data-pick /></label>
          </div>
          ${n ? `<a class="btn primary block" href="#/check/${exam.id}/crop">ครอบภาพ ${n} แผ่น${ico("next")}</a>`
            : `<button class="link" id="sample">ยังไม่มีกระดาษ? ลองด้วยรูปตัวอย่าง 3 แผ่น</button>`}
        </div>
      </div>`, opts);

    const busy = $("#busy");
    // เพิ่มรูป + หาขอบกระดาษให้อัตโนมัติ (Photos.findPaper) → ขั้นครอบภาพครูแค่ตรวจแล้วยืนยัน
    const add = async (list) => {
      let t = Date.now(), k = 0;
      for (const x of list) {
        busy.hidden = false;
        busy.textContent = `กำลังหาขอบกระดาษ ${++k}/${list.length}…`;
        const auto = x.guess ? null : await Photos.findPaper(x.blob).catch(() => null);
        const thumb = await Photos.thumb(x.blob).catch(() => null);
        const id = uid();
        try {
          await Data.putSheet({ id, format: FORMAT, examId: exam.id, image: x.blob, thumb, w: x.w, h: x.h, name: x.name, guess: x.guess || auto,
            auto: !!auto, corners: null, done: false, result: null, overrides: {}, saved: false, sample: !!x.sample, createdAt: t++ });
        } catch (err) {
          await Data.delSheet(id).catch(() => {});
          toast(storageError(err, list.length - k + 1));
          break;
        }
      }
      photoStep(exam, stepper, opts);
    };
    $$("[data-pick]").forEach((inp) => (inp.onchange = async () => {
      const files = [...inp.files];
      if (!files.length) return;
      $$(".step-actions .btn, .step-actions .link").forEach((b) => b.classList.add("off"));
      busy.hidden = false;
      const heic = files.some(Photos.isHeic);
      const { ok, errors } = await Photos.openMany(files, (i, all) => (busy.textContent = `กำลังเปิดรูป ${i}/${all}${heic ? " (แปลงไฟล์ iPhone อาจใช้เวลาสักครู่)" : ""}…`));
      ok.forEach((x) => URL.revokeObjectURL(x.url)); // ใช้ blob เก็บลงเครื่อง แล้วสร้าง url ใหม่ตอนแสดง
      if (errors.length) toast(errors.length === 1 ? errors[0] : `เปิดไม่ได้ ${errors.length} ไฟล์ — ใช้รูป JPG, PNG หรือ HEIC`);
      add(ok);
    }));
    $$("[data-rm]").forEach((b) => (b.onclick = async () => { await Data.delSheet(b.dataset.rm); curIdx[exam.id] = 0; photoStep(exam, stepper, opts); }));
    const s = $("#sample");
    if (s) s.onclick = async () => { s.disabled = true; add(await Promise.all(SAMPLE_CORNERS.map((c) => sampleSheet(exam, c)))); };
  }

  // 2 ครอบภาพ — ทีละแผ่น ลากมุมทั้ง 4 ให้ตรงมุมกระดาษ แล้วยืนยัน
  function cropStep(exam, stepper, opts) {
    const items = Data.pending(exam.id);
    const i = Math.min(curIdx[exam.id] || 0, items.length - 1);
    const it = items[i];
    let pts = (it.corners || it.guess || DEFAULT_CORNERS).map((p) => [...p]);
    const left = items.filter((x, j) => !x.done && j !== i).length;
    const autoLeft = items.filter((x, j) => !x.done && j !== i && x.guess).length; // แผ่นอื่นที่ระบบหาขอบให้แล้ว
    view(`${stepper}
      <div class="step-body">
        ${strip(items, i, (x) => (x.done ? `<span class="strip-ok">✓</span>` : ""))}
        <p class="m-lead"><b>แผ่นที่ ${i + 1}${items.length > 1 ? ` จาก ${items.length}` : ""}</b> <span class="muted">${it.auto ? "ระบบหาขอบให้แล้ว ถ้าไม่ตรงลากจุดแก้ได้" : it.guess ? "ตรวจมุมแล้วกดยืนยัน" : "ระบบหาขอบไม่เจอ ลากจุดทั้ง 4 ให้ตรงมุมกระดาษ"}</span></p>
        <div class="crop" id="crop" style="aspect-ratio:${it.w} / ${it.h}; --ar:${(it.w / it.h).toFixed(4)}">
          <img src="${Data.url(it)}" alt="" draggable="false" />
          <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><path class="crop-shade" fill-rule="evenodd"/><polygon class="crop-edge"/></svg>
          ${pts.map((_, k) => `<button class="handle" data-i="${k}" aria-label="มุมที่ ${k + 1}"></button>`).join("")}
        </div>
        <div class="step-actions row">
          <button class="btn ghost" id="reset">${it.auto ? "หาขอบใหม่" : "คืนค่ามุม"}</button>
          <button class="btn primary grow" id="ok">${left ? `ยืนยัน · แผ่นถัดไป` : `ตรวจข้อสอบ${items.length > 1 ? ` ${items.length} แผ่น` : ""}`}${ico("next")}</button>
        </div>
        ${autoLeft ? `<button class="link center-link" id="ok-all">ใช้ขอบที่ระบบหาให้กับทุกแผ่นที่เหลือ (${autoLeft + 1} แผ่น)</button>` : ""}
      </div>`, opts);

    const box = $("#crop");
    const draw = () => {
      const P = pts.map(([x, y]) => [x * 1000, y * 1000]);
      $(".crop-edge", box).setAttribute("points", P.map((p) => p.join(",")).join(" "));
      $(".crop-shade", box).setAttribute("d", `M0 0H1000V1000H0Z M${P.map((p) => p.join(" ")).join(" L")}Z`);
      $$(".handle", box).forEach((h, k) => { h.style.left = pts[k][0] * 100 + "%"; h.style.top = pts[k][1] * 100 + "%"; });
    };
    draw();
    $$(".handle", box).forEach((h) => {
      h.onpointerdown = (e) => {
        e.preventDefault();
        h.setPointerCapture(e.pointerId);
        h.classList.add("drag");
        const k = Number(h.dataset.i);
        h.onpointermove = (ev) => {
          const r = box.getBoundingClientRect();
          pts[k] = [Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))];
          draw();
        };
        h.onpointerup = h.onpointercancel = () => { h.onpointermove = null; h.classList.remove("drag"); it.corners = pts; Data.putSheet(it); }; // จำไว้แม้ยังไม่ยืนยัน
      };
    });
    $("#reset").onclick = () => { pts = (it.guess || DEFAULT_CORNERS).map((p) => [...p]); it.corners = pts; draw(); };
    // ยืนยันแผ่นนี้ + ทุกแผ่นที่ระบบหาขอบได้ทีเดียว · แผ่นที่หาไม่เจอยังต้องครอบเอง
    const all = $("#ok-all");
    if (all) all.onclick = async () => {
      for (const x of items) {
        if (x.done && x !== it) continue;
        if (x !== it && !x.guess) continue;
        Object.assign(x, { corners: x === it ? pts : x.guess.map((p) => [...p]), done: true, result: null, error: null, overrides: {} });
        await Data.putSheet(x);
      }
      const rest = items.findIndex((x) => !x.done);
      if (rest >= 0) { curIdx[exam.id] = rest; toast("แผ่นนี้ระบบหาขอบไม่เจอ ครอบเองก่อน"); cropStep(exam, stepper, opts); return; }
      curIdx[exam.id] = 0;
      location.hash = `#/check/${exam.id}/grade`;
    };
    $$("[data-go]").forEach((b) => (b.onclick = () => { curIdx[exam.id] = Number(b.dataset.go); cropStep(exam, stepper, opts); }));
    $("#ok").onclick = async () => {
      Object.assign(it, { corners: pts, done: true, result: null, error: null, overrides: {} }); // ครอบใหม่ → ตรวจใหม่
      await Data.putSheet(it);
      const next = items.findIndex((x, j) => !x.done && j > i);
      const any = next >= 0 ? next : items.findIndex((x) => !x.done);
      if (any >= 0) { curIdx[exam.id] = any; cropStep(exam, stepper, opts); return; }
      curIdx[exam.id] = 0;
      location.hash = `#/check/${exam.id}/grade`;
    };
  }

  // 3 ตรวจข้อสอบ — แต่ละแผ่นผ่านโมเดล 3 ขั้น: ตัดครอบภาพ → จับช่องคำตอบ → อ่านลายมือ (ทีละแผ่นตามลำดับ)
  const MODEL_STAGES = [
    ["ตัดครอบภาพ", "ปรับกระดาษให้ตรงจากสี่เหลี่ยมดำที่มุมกระดาษ"],
    ["จับช่องคำตอบ", `หาช่องคำตอบ ${MAX_Q} ข้อ × ${MAX_BOX} ช่อง`],
    ["อ่านลายมือ", "อ่านตัวอักษรทีละช่อง"],
  ];
  const STAGE_MS = [700, 600, 1100]; // เวลาจำลองต่อขั้น (รูปตัวอย่าง / โหมดจำลอง)
  let gradeUI = null;                // หน้าตรวจที่เปิดอยู่ — ให้ตัวรันโมเดลอัปเดตหน้าจอ
  const perSheet = [];               // เวลาที่ใช้ต่อแผ่นล่าสุด (วินาที) → บอกเวลาที่เหลือโดยประมาณ
  let running = false;
  // ยังไม่ได้ต่อโมเดลจริง → ทุกแผ่นใช้ผลจำลอง (mockResult) · ต่อโมเดลใหม่ทีหลังที่ runModels [claude/gelatin · 2026-10-28]
  const usesEngine = () => false;

  // รันโมเดลทีละแผ่นที่ครอบแล้วแต่ยังไม่มีผล (ทุกข้อสอบ) · ปิดแอปกลางคันแล้วเปิดใหม่ → ตรวจต่อจากแผ่นที่ค้าง (แบบคิวของ Prame)
  // it.run = { stage: ขั้นที่ทำอยู่ 0–2, p: ความคืบหน้าของขั้นนั้น 0–1, note: ข้อความเพิ่ม } · it.error = ตรวจไม่สำเร็จ (ครูครอบใหม่/เอาออก)
  // ตอนนี้ทั้ง 3 ขั้นเป็นการจำลอง (STAGE_MS) แล้วใช้ mockResult [claude/gelatin · 2026-10-28]
  async function runModels() {
    if (running) return;
    running = true;
    const progress = (it, finished) => gradeUI?.progress(it, finished);
    let cur = null, cornersAt = "";
    const gone = (it) => !Data.sheet(it.id) || !it.done || JSON.stringify(it.corners) !== cornersAt; // ถูกลบ/ครอบใหม่ระหว่างตรวจ
    // โมเดลจริงไม่บอก % ระหว่างขั้น → ค่อยๆ เลื่อนแถบเข้าหา 95% ของขั้นนั้น
    const tick = setInterval(() => { if (cur?.run && usesEngine(cur)) { cur.run.p += (0.95 - cur.run.p) * 0.05; progress(cur); } }, 120);
    // กันจอมือถือดับระหว่างตรวจหลายแผ่น (จอดับ = เบราว์เซอร์หยุดทำงาน) · เบราว์เซอร์ที่ไม่รองรับก็ตรวจต่อได้ แค่ต้องเปิดจอไว้เอง
    let wake = null;
    try { wake = await navigator.wakeLock?.request("screen"); } catch {}
    try {
      for (let it; (it = Data.all().find((x) => x.done && !x.saved && !x.result && !x.error)); ) {
        const exam = await Data.exam(it.examId);
        if (!exam) { await Data.delSheet(it.id); continue; }
        cur = it;
        cornersAt = JSON.stringify(it.corners);
        const stage = (s, note = "") => { if (it.run && s !== it.run.stage) it.run = { stage: s, p: 0, note }; else if (it.run) it.run.note = note; progress(it); };
        it.run = { stage: 0, p: 0, note: "" };
        try {
          {
            for (let s = 0; s < MODEL_STAGES.length; s++) {
              it.run = { stage: s, p: 0 };
              const t0 = performance.now();
              while (it.run.p < 1 && !gone(it)) {
                await new Promise((r) => setTimeout(r, 60));
                it.run.p = Math.min(1, (performance.now() - t0) / STAGE_MS[s]);
                progress(it);
              }
              if (gone(it)) break;
            }
            if (gone(it)) { it.run = null; continue; }
            it.result = mockResult(asExam(exam), { page: 1 });
          }
        } catch (err) {
          if (gone(it)) { it.run = null; continue; }
          it.error = err?.name === "QuotaExceededError" ? storageError(err) : err.message;
        }
        delete it.firstError;
        // ไม่นับแผ่นแรกที่ต้องโหลดโมเดล (นานผิดปกติ) · เก็บ 10 แผ่นล่าสุด
        it.run = null;
        cur = null;
        if (gone(it)) { if (Data.sheet(it.id)) { it.result = null; it.error = null; } continue; }
        // เก็บผลไม่ได้ (พื้นที่เต็ม) → แสดงเป็นแผ่นที่มีปัญหา ไม่ทำให้คิวทั้งหมดหยุด
        try { await Data.putSheet(it); }
        catch (err) { Object.assign(it, { result: null, hand: null, error: storageError(err) }); }
        progress(it, true);
      }
    } finally { running = false; clearInterval(tick); wake?.release().catch(() => {}); }
  }

  function gradeStep(exam, stepper, opts) {
    const items = Data.pending(exam.id);
    const doneN = () => items.filter((x) => x.result).length;
    const errN = () => items.filter((x) => x.error).length;
    const runningAt = () => items.findIndex((x) => !x.result && !x.error);

    const badge = (x) => {
      if (x.result) { const g = gradeOf(x, exam); return `<span class="strip-b strip-sc ${g.review ? "rv" : ""}">${num(g.score)}/${g.max}</span>`; }
      if (x.error) return `<span class="strip-b strip-err" aria-label="ตรวจไม่สำเร็จ">!</span>`;
      return x.run ? `<span class="strip-b strip-run" aria-label="กำลังตรวจ"></span>` : `<span class="strip-b strip-wait">รอ</span>`;
    };

    // เวลาที่เหลือ (เมื่อเหลือหลายแผ่นและรู้ความเร็วแล้ว)
    const eta = (left) => {
      if (left < 3 || !perSheet.length) return "";
      const min = Math.ceil((left * perSheet.reduce((a, x) => a + x, 0)) / perSheet.length / 60);
      return ` · เหลือประมาณ ${min} นาที`;
    };
    const summary = () => {
      const n = items.length, d = doneN(), e = errN(), r = runningAt();
      const run = r >= 0 ? items[r].run : null;
      const pct = ((d + e + (run ? (run.stage + run.p) / MODEL_STAGES.length : 0)) / n) * 100;
      const text = d === n ? `ตรวจครบ ${n} แผ่นแล้ว`
        : r < 0 ? `ตรวจได้ ${d} จาก ${n} แผ่น · มีปัญหา ${e} แผ่น`
        : `กำลังตรวจ${n > 1 ? `แผ่นที่ ${r + 1} จาก ${n}` : ""}${run ? ` · ${MODEL_STAGES[run.stage][0]}` : ""}${eta(n - d - e)}`;
      return `<div class="run-sum-t"><span>${text}</span><b>${Math.floor(pct)}%</b></div>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(pct)}"><i style="width:${pct}%"></i></div>`;
    };

    const stages = (it) => {
      const r = runningAt();
      return `<div id="stages"><ol class="stages">${MODEL_STAGES.map(([t, d], s) => {
        const st = !it.run ? "wait" : s < it.run.stage ? "done" : s === it.run.stage ? "now" : "wait";
        const p = st === "done" ? 100 : st === "now" ? Math.floor(it.run.p * 100) : 0;
        return `<li class="${st}"><span class="st-ico">${st === "done" ? "✓" : s + 1}</span>
          <span class="st-t"><b>${t}</b><small>${d}</small><span class="bar"><i style="width:${p}%"></i></span></span>
          <span class="st-p">${st === "wait" ? "" : p + "%"}</span></li>`;
      }).join("")}</ol>
      ${it.run?.note ? `<p class="muted small center">${esc(it.run.note)}</p>` : ""}
      ${!it.run && r >= 0 && items[r] !== it ? `<p class="muted small center">รอคิว — กำลังตรวจแผ่นที่ ${r + 1} อยู่</p>` : ""}</div>`;
    };

    // แผ่นที่ตรวจไม่สำเร็จ: บอกเหตุผล + ทางแก้ (ครอบใหม่ / ลองอีกครั้ง / เอาออก)
    const errorBox = (it) => `<div class="run-err" id="stages" role="alert">
        <b>ตรวจแผ่นนี้ไม่สำเร็จ</b><p>${esc(it.error)}</p>
        <p class="small muted">มักเกิดจากรูปไม่เห็นสี่เหลี่ยมดำที่มุมกระดาษครบ — ครอบภาพให้กว้างขึ้น หรือถ่ายใหม่ให้เห็นทั้งแผ่น</p>
        <div class="row-btns">
          <button class="btn ghost" id="e-crop">ครอบภาพใหม่</button>
          <button class="btn ghost" id="e-retry">ลองอีกครั้ง</button>
          <button class="link danger-link" id="e-rm">${ico("trash")}เอาแผ่นนี้ออก</button>
        </div>
      </div>`;

    const saveLabel = () => doneN() === items.length ? `บันทึกคะแนน${items.length > 1 ? ` ${items.length} แผ่น` : ""}`
      : runningAt() < 0 && errN() ? `แก้แผ่นที่มีปัญหาก่อน (${errN()} แผ่น)` : `รอตรวจให้ครบ (${doneN()}/${items.length})`;

    function render() {
      const i = Math.min(curIdx[exam.id] || 0, items.length - 1), it = items[i];
      view(`${stepper}
        <div class="step-body">
          ${strip(items, i, badge)}
          <div class="run-sum" id="sum">${summary()}</div>
          ${it.result ? `<div id="res"></div>` : `<div class="run-photo"><img src="${Data.url(it)}" alt="แผ่นที่ ${i + 1}" /></div>${it.error ? errorBox(it) : stages(it)}`}
          <div class="step-actions"><button class="btn primary block" id="save" ${doneN() === items.length ? "" : "disabled"}>${saveLabel()}</button></div>
        </div>`, opts);
      if (it.result) resultPanel($("#res"), it, exam, () => { const b = $(`[data-go="${i}"] .strip-b`); if (b) b.outerHTML = badge(it); });
      if (it.error) {
        $("#e-crop").onclick = async () => { Object.assign(it, { done: false, error: null }); await Data.putSheet(it); curIdx[exam.id] = i; location.hash = `#/check/${exam.id}/crop`; };
        $("#e-retry").onclick = async () => { it.error = null; await Data.putSheet(it); render(); runModels(); };
        armButton($("#e-rm"), "แตะอีกครั้งเพื่อเอาออก", async () => {
          await Data.delSheet(it.id);
          curIdx[exam.id] = 0;
          if (Data.pending(exam.id).length) flow(exam.id, "grade"); else location.hash = `#/check/${exam.id}/photo`;
        });
      }
      $$("[data-go]").forEach((b) => (b.onclick = () => { curIdx[exam.id] = Number(b.dataset.go); render(); }));
      $("#save").onclick = async () => {
        const review = items.reduce((a, x) => a + gradeOf(x, exam).review, 0);
        for (const x of items) { x.saved = true; await Data.putSheet(x); }
        gradeUI = null;
        curIdx[exam.id] = 0;
        toast(`บันทึกคะแนน ${items.length} แผ่นแล้ว${review ? ` · ยังมี ${review} ข้อที่ระบบไม่แน่ใจ` : ""}`);
        location.hash = `#/exam/${exam.id}`;
      };
    }

    // อัปเดตเฉพาะส่วนที่เปลี่ยน (ไม่วาดใหม่ทั้งหน้า → หน้าไม่กระโดดตอนครูเลื่อนดูผลแผ่นอื่น)
    function progress(it, finished) {
      if (!location.hash.endsWith(`/${exam.id}/grade`) || !$("#sum") || !items.includes(it)) return;
      if (finished && items.indexOf(it) === Math.min(curIdx[exam.id] || 0, items.length - 1)) { render(); return; } // แผ่นที่เปิดดูอยู่ตรวจเสร็จ → แสดงผล
      $("#sum").innerHTML = summary();
      const cur = items[Math.min(curIdx[exam.id] || 0, items.length - 1)];
      if (!cur.result && !cur.error && $("#stages")) $("#stages").outerHTML = stages(cur);
      items.forEach((x, j) => {
        const b = $(`[data-go="${j}"] .strip-b`);
        if (b && !b.classList.contains(x.result ? "strip-sc" : x.error ? "strip-err" : x.run ? "strip-run" : "strip-wait")) b.outerHTML = badge(x);
      });
      const save = $("#save");
      save.disabled = doneN() !== items.length;
      save.textContent = saveLabel();
    }

    gradeUI = { progress };
    render();
    runModels();
  }

  // ภาพที่ตัดขอบแล้วของแต่ละแผ่น (โหลดครั้งเดียว ใช้ตัดแถวลายมือ)
  const handCache = new Map();
  const handImg = (s) => {
    const src = s.hand ? Data.handUrl(s) : s.result.images.rectified;
    if (handCache.get(s.id)?.src !== src) handCache.set(s.id, { src, p: new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; }) });
    return handCache.get(s.id).p;
  };

  // ---------- ผลตรวจ 1 แผ่น (ใช้ทั้งขั้นตรวจและหน้าดูผล) ----------
  // แตะข้อ → เปิดแก้: แตะตัวอักษรที่อ่านผิดแล้วเลือกตัวที่ถูก (ตัวเลือกจากโมเดล 3 อันดับ / พิมพ์เอง / ลบ) · หรือสั่งนับถูก/ผิดทั้งข้อ
  function resultPanel(el, s, exam, onChange = () => {}) {
    let openQ = null, selC = null;
    const lowConf = () => Settings.get().lowConf;
    // ชื่อนักเรียนที่ตรงกับเลขประจำตัว (มีรายชื่อห้องที่สอบเท่านั้น)
    const whoLine = () => {
      if (!rosterOf(exam).length) return "";
      const st = studentMatch(s, exam);
      return st ? `${esc(st.name)} · ${esc(st.room)}${st.no ? ` เลขที่ ${st.no}` : ""}` : `<span class="bad">ไม่พบในรายชื่อ${exam.rooms.length ? ` ${esc(exam.rooms.join(", "))}` : ""}</span>`;
    };
    const MARK = { right: "✓", wrong: "✗", partial: "½", review: "?" };
    const NOTE = { right: "ถูก", wrong: "ผิด", partial: "ได้บางส่วน", review: "ระบบไม่แน่ใจ" };

    const cellsOf = (q) => s.result.reads[q - 1].map((c, j) => ({ ...c, j })).filter((c) => c.cls !== "empty");
    const cellHtml = (c, keyCh, btn) => {
      const cls = [c.cls === "crossed" ? "x" : "", c.cls === "char" && c.conf < lowConf() ? "low" : "", c.cls === "char" && keyCh && c.char.toUpperCase() !== keyCh ? "diff" : "", selC === c.j ? "sel" : ""].join(" ");
      const ch = esc(c.lower ? c.char.toLowerCase() : c.char);
      return btn ? `<button class="c ${cls}" data-c="${c.j}" aria-label="ช่องที่ ${c.j + 1}: ${ch}">${ch}</button>` : `<i class="c ${cls}">${ch}</i>`;
    };

    function draw() {
      const g = gradeOf(s, exam);
      el.innerHTML = `
        <div class="res-head">
          <div class="score"><b>${num(g.score)}/${num(g.max)}</b><span>คะแนน${g.scaled != null ? `<br />คิดเป็น ${num(g.scaled)}/${num(exam.scaleTo)}` : ""}</span></div>
          <label class="sid">เลขประจำตัว<input id="sid" value="${esc(studentOf(s))}" inputmode="numeric" autocomplete="off" />
            <small id="sid-who">${whoLine()}</small></label>
        </div>
        ${exam.sets > 1 ? `<div class="set-pick"><span class="small muted">ชุดข้อสอบ${s.setOverride ? " (ครูเลือก)" : " (อ่านจากกระดาษ)"}</span>
          <div class="seg" role="radiogroup">${Array.from({ length: exam.sets }, (_, k) => `<button data-set-o="${k + 1}" class="${g.set === k + 1 ? "on" : ""}" role="radio" aria-checked="${g.set === k + 1}">ชุดที่ ${k + 1}</button>`).join("")}</div></div>` : ""}
        ${s.result.header?.student_id?.review && !s.studentId ? `<p class="review-note">ระบบอ่านเลขประจำตัวไม่ชัด — ตรวจเลขด้านบนอีกครั้ง</p>` : ""}
        ${(s.result.quality?.warnings || []).map((w) => `<p class="review-note">${esc(w)}</p>`).join("")}
        ${g.review ? `<p class="review-note">ระบบไม่แน่ใจ ${g.review} ข้อ — แตะข้อที่มี ? เพื่อตรวจ</p>` : ""}
        ${s.result.mock ? `<p class="sim-note">${s.sample ? "รูปตัวอย่าง — ผลจำลอง ไม่ได้อ่านจากโมเดลจริง" : "โหมดจำลอง — ยังไม่ได้ต่อโมเดลจริง ผลไม่ได้อ่านจากรูปจริง"}</p>` : ""}
        <ol class="answers">${g.rows.map((r) => {
          let k = 0;
          const cells = cellsOf(r.q).map((c) => cellHtml(c, c.cls === "char" ? r.key[k++] : "", false)).join("");
          const open = openQ === r.q;
          return `<li class="row st-${r.status} ${open ? "open" : ""}">
            <button class="row-main" data-q="${r.q}" aria-expanded="${open}">
              <span class="q">${r.q}</span>
              <span class="ans"><span class="boxes">${cells || `<span class="muted small">ไม่ได้ตอบ</span>`}</span>
                <small>เฉลย ${esc(r.key)}${r.note ? ` · ${esc(r.note)}` : ""}${r.override ? " · ครูแก้" : ""}</small></span>
              <span class="mark" aria-label="${NOTE[r.status] || ""}">${MARK[r.status] || ""}</span>
            </button>
            ${open ? editor(r) : ""}
          </li>`;
        }).join("")}
        </ol>`;
      bind();
    }

    function editor(r) {
      let k = 0;
      const cells = cellsOf(r.q);
      const sel = cells.find((c) => c.j === selC);
      const top = sel?.top3 ? [...new Set(sel.top3.map(([ch]) => ch))] : [];
      const o = s.overrides?.[r.q] || "";
      const img = s.hand || s.result.images?.rectified;
      return `<div class="row-edit">
        ${img ? `<canvas class="hand" data-hand="${r.q}" aria-label="ลายมือในกระดาษ ข้อ ${r.q}" role="img"></canvas>` : ""}
        <p class="small muted">${cells.length ? "แตะตัวอักษรที่อ่านผิดเพื่อแก้" : "ไม่มีตัวอักษรในข้อนี้"}</p>
        ${cells.length ? `<div class="edit-cells">${cells.map((c) => cellHtml(c, c.cls === "char" ? r.key[k++] : "", true)).join("")}</div>` : ""}
        ${sel ? `<div class="picker">
          ${top.map((ch) => `<button class="chip" data-pick="${ch}">${ch}</button>`).join("")}
          <input class="pick-in" maxlength="1" autocapitalize="characters" autocomplete="off" placeholder="พิมพ์" aria-label="พิมพ์ตัวอักษรที่ถูก" />
          <button class="chip ghost" data-pick="">ลบช่องนี้</button>
        </div>` : ""}
        <div class="seg" role="group" aria-label="การนับคะแนนข้อนี้">
          ${[["", "ตามเกณฑ์"], ["right", "นับถูก"], ["wrong", "นับผิด"]].map(([v, l]) => `<button data-o="${v}" class="${o === v ? "on" : ""}" aria-pressed="${o === v}">${l}</button>`).join("")}
        </div>
      </div>`;
    }

    const save = () => { Data.putSheet(s); onChange(); draw(); };
    // วาดแถวลายมือจริงของข้อที่เปิดอยู่ (ตัดจากภาพที่ตัดขอบแล้วตามกรอบช่องที่โมเดลหาได้)
    function drawHand() {
      const cv = $("[data-hand]", el);
      if (!cv) return;
      const row = s.result.reads[Number(cv.dataset.hand) - 1].map((c) => c.bbox).filter(Boolean);
      if (!row.length) { cv.remove(); return; }
      handImg(s).then((im) => {
        if (!cv.isConnected) return;
        const W = im.naturalWidth, H = im.naturalHeight;
        const x1 = Math.min(...row.map((b) => b[0])) * W, x2 = Math.max(...row.map((b) => b[2])) * W;
        const y1 = Math.min(...row.map((b) => b[1])) * H, y2 = Math.max(...row.map((b) => b[3])) * H;
        const pad = (y2 - y1) * 0.15;
        cv.width = Math.round(x2 - x1 + 2 * pad); cv.height = Math.round(y2 - y1 + 2 * pad);
        cv.getContext("2d").drawImage(im, x1 - pad, y1 - pad, cv.width, cv.height, 0, 0, cv.width, cv.height);
      }).catch(() => cv.remove());
    }
    function bind() {
      drawHand();
      $("#sid", el).oninput = (e) => { s.studentId = e.target.value.replace(/\D/g, ""); $("#sid-who", el).innerHTML = whoLine(); };
      $("#sid", el).onchange = () => { Data.putSheet(s); onChange(); };
      $$("[data-set-o]", el).forEach((b) => (b.onclick = () => { s.setOverride = Number(b.dataset.setO); openQ = null; save(); }));
      $$(".row-main", el).forEach((b) => (b.onclick = () => { const q = Number(b.dataset.q); openQ = openQ === q ? null : q; selC = null; draw(); }));
      $$(".edit-cells .c", el).forEach((b) => (b.onclick = () => { selC = Number(b.dataset.c); draw(); $(".pick-in", el)?.focus({ preventScroll: true }); }));
      const setCell = (ch) => {
        const c = s.result.reads[openQ - 1][selC];
        if (ch) Object.assign(c, { char: ch, conf: 1, cls: "char", lower: false });
        else Object.assign(c, { char: "", conf: 1, cls: "empty" });
        selC = null;
        save();
      };
      $$("[data-pick]", el).forEach((b) => (b.onclick = () => setCell(b.dataset.pick)));
      const inp = $(".pick-in", el);
      if (inp) inp.oninput = () => { const ch = inp.value.toUpperCase().replace(/[^A-Z]/g, ""); if (ch) setCell(ch); else inp.value = ""; };
      $$("[data-o]", el).forEach((b) => (b.onclick = () => {
        s.overrides ||= {};
        if (b.dataset.o) s.overrides[openQ] = b.dataset.o; else delete s.overrides[openQ];
        save();
      }));
    }
    draw();
  }

  // ---------- ตั้งค่า ----------
  async function settingsView() {
    const u = Session.user();
    // พื้นที่ที่ใช้ (รูปกระดาษ ~1 MB ต่อแผ่น) — เพื่อให้ครูรู้ว่าควรลบรูปของการสอบที่ส่งคะแนนแล้ว
    let storageLine = "";
    try { const e = await navigator.storage?.estimate?.(); if (e?.usage) storageLine = ` · ตอนนี้ใช้พื้นที่ ${Math.round(e.usage / 1e6)} MB (${Data.all().filter((x) => x.image).length} แผ่นที่มีรูป)`; } catch {}
    const st = Settings.get();
    const seg = (name, opts) => `<div class="seg" role="radiogroup">${opts.map(([v, l]) =>
      `<button type="button" data-set="${name}" data-v="${v}" class="${st[name] === v ? "on" : ""}" role="radio" aria-checked="${st[name] === v}">${l}</button>`).join("")}</div>`;
    view(`
      <section class="m-card acct">
        <span class="avatar lg">${esc(u.name.slice(0, 1).toUpperCase())}</span>
        <span class="acct-name"><b>${esc(u.name)}</b><small>ครูผู้สอน</small></span>
      </section>

      <h2 class="sec-h">ระบบตรวจ</h2>
      <section class="m-card rules">
        <div class="rule"><span>อ่านลายมือด้วย</span><b>โหมดจำลอง</b></div>
        <p class="small muted">ยังไม่ได้ต่อโมเดลอ่านลายมือ — ตอนนี้คะแนนเป็นผลจำลอง ไม่ได้อ่านจากรูปจริง</p>
      </section>

      <h2 class="sec-h">เกณฑ์ตรวจ</h2>
      <section class="m-card rules">
        <div class="rule">
          <span>ให้ครูตรวจเมื่อระบบมั่นใจต่ำกว่า <b id="lc-v">${Math.round(st.lowConf * 100)}%</b></span>
          <input type="range" min="0.3" max="0.95" step="0.05" value="${st.lowConf}" id="lc" aria-label="ระดับความมั่นใจ" />
        </div>
        <div class="rule"><span>ตัวพิมพ์เล็ก</span>${seg("lowercase", [["upper", "นับเป็นพิมพ์ใหญ่"], ["wrong", "นับผิด"]])}</div>
        <div class="rule"><span>เว้นช่องกลางคำ</span>${seg("gap", [["join", "อ่านต่อกัน"], ["wrong", "นับผิด"]])}</div>
        <div class="rule"><span>ไม่เริ่มเขียนที่ช่องแรก</span>${seg("start", [["accept", "ยอมรับ"], ["wrong", "นับผิด"]])}</div>
        <div class="rule"><span>การให้คะแนน</span>${seg("partial", [["word", "ถูกทั้งคำเท่านั้น"], ["letters", "ตามตัวอักษรที่ถูก"]])}</div>
        <p class="small muted">มีผลกับคะแนนทุกแผ่น รวมแผ่นที่บันทึกไปแล้ว</p>
      </section>

      <h2 class="sec-h">ข้อมูลจากฝ่ายวิชาการ</h2>
      <section class="m-card rules">
        <div class="rule"><span>${st.schoolName ? `<b>${esc(st.schoolName)}</b> · ` : ""}${esc(termLabel(st))}</span>
          <small class="muted">${Data.classes().length ? `${Data.classes().length} ห้อง · นักเรียน ${Data.classes().reduce((a, c) => a + (c.students?.length || 0), 0)} คน` : "ยังไม่มีรายชื่อนักเรียน"}${st.rulesFromSchool ? " · ใช้เกณฑ์ตรวจของโรงเรียน" : ""}</small></div>
        <label class="rule">ชื่อครู (ใส่ในไฟล์ส่งคะแนน)<input id="tname" value="${esc(st.teacherName || "")}" placeholder="${esc(u.name)}" autocomplete="name" /></label>
        <label class="btn ghost block file-btn">${ico("upload")}นำเข้าไฟล์จากฝ่ายวิชาการ<input type="file" accept=".json,application/json" hidden id="pkg" /></label>
        <p class="small muted">ได้รายชื่อนักเรียน รายวิชา ข้อสอบกลาง และเกณฑ์ตรวจของโรงเรียน · ขอไฟล์ได้จากฝ่ายวิชาการ (Dashboard › รายวิชาและครู)</p>
      </section>

      <h2 class="sec-h">ข้อมูลในเครื่อง</h2>
      <section class="m-card list">
        <button id="backup">${ico("download")}สำรองข้อสอบและคะแนน (ไม่รวมรูป)</button>
        <label class="file-row">${ico("upload")}กู้คืนจากไฟล์สำรอง<input type="file" accept=".json,application/json" hidden id="restore" /></label>
        <button id="wipe" class="danger">${ico("trash")}ลบข้อสอบและคะแนนทั้งหมด</button>
      </section>
      <p class="small muted pad">ข้อสอบ รูป และคะแนนเก็บในเครื่องนี้เท่านั้น ไม่ได้ส่งไปที่ไหน — สำรองไว้ก่อนเปลี่ยนเครื่องหรือล้างเบราว์เซอร์${storageLine}</p>

      <section class="m-card list">
        <button id="logout" class="danger">${ico("logout")}ออกจากระบบ</button>
      </section>`, { title: "ตั้งค่า" });

    const lc = $("#lc");
    lc.oninput = () => ($("#lc-v").textContent = Math.round(lc.value * 100) + "%");
    lc.onchange = () => Settings.set({ lowConf: Number(lc.value) });
    $$("[data-set]").forEach((b) => (b.onclick = () => {
      Settings.set({ [b.dataset.set]: b.dataset.v });
      $$(`[data-set="${b.dataset.set}"]`).forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); });
    }));

    $("#backup").onclick = async () => {
      // ไม่รวมรูป: รูปหลายร้อยแผ่นรวมเป็นไฟล์เดียวไม่ได้ (ทดสอบ 378 แผ่น → เบราว์เซอร์สร้างข้อความยาวขนาดนั้นไม่ได้)
      // เก็บข้อสอบ ผลอ่านทุกช่อง การแก้ของครู และคะแนน → กู้คืนแล้วคะแนนครบ แก้ผลได้ แต่ไม่มีรูปให้ดู
      const exams = await Data.exams();
      const sheets = Data.all().map(({ image, thumb, hand, run, ...rest }) => rest);
      const json = JSON.stringify({ app: "examer", type: "backup", format: FORMAT, photos: false, at: new Date().toISOString(), exams, sheets, classes: Data.classes() });
      download(new Blob([json], { type: "application/json" }), `examer-สำรอง-${new Date().toISOString().slice(0, 10)}.json`);
    };
    $("#restore").onchange = async (e) => {
      try {
        const data = JSON.parse(await e.target.files[0].text());
        if (data.app !== "examer" || data.format !== FORMAT) throw new Error("ไม่ใช่ไฟล์สำรองของแอปนี้");
        for (const x of data.exams || []) await Data.saveExam(x);
        for (const c of data.classes || []) await Store.put("classes", c);
        for (const s of data.sheets || []) {
          if (Data.sheet(s.id)?.image) continue; // มีแผ่นนี้ (พร้อมรูป) อยู่แล้ว ไม่เขียนทับ
          await Data.putSheet({ ...s, image: typeof s.image === "string" ? await (await fetch(s.image)).blob() : null }); // ไฟล์สำรองรุ่นก่อนมีรูปเป็น dataURL
        }
        await Data.reloadClasses();
        toast(`กู้คืนแล้ว: ${(data.exams || []).length} ข้อสอบ · ${(data.sheets || []).length} แผ่น`);
      } catch (err) { toast("กู้คืนไม่สำเร็จ: " + err.message); }
      e.target.value = "";
    };
    armButton($("#wipe"), "แตะอีกครั้งเพื่อลบทั้งหมด", async () => { await Data.clear(); toast("ลบข้อสอบและคะแนนแล้ว"); });
    $("#logout").onclick = () => { Session.logout(); location.hash = "#/"; Router.go(); };

    $("#tname").onchange = (e) => { Settings.set({ teacherName: e.target.value.trim() }); toast("บันทึกชื่อครูแล้ว"); };
    $("#pkg").onchange = async (e) => {
      try {
        const n = await Transfer.importPackage(await readJsonFile(e.target.files[0]));
        await Data.reloadClasses();
        toast(`นำเข้าแล้ว: ${n.classes} ห้อง · ${n.subjects} วิชา · ข้อสอบกลาง ${n.exams} ชุด`);
        settingsView();
      } catch (err) { toast(err.message); }
      e.target.value = "";
    };

  }

  // ---------- ตัวช่วย ----------
  // ปุ่มที่ต้องแตะ 2 ครั้ง (กันลบพลาด)
  function armButton(btn, confirmText, fn, confirmLabel = confirmText) {
    let armed = false, timer;
    const label = btn.innerHTML, aria = btn.getAttribute("aria-label");
    btn.onclick = async () => {
      if (!armed) {
        armed = true; btn.classList.add("armed"); if (confirmText) btn.textContent = confirmText;
        if (confirmLabel) btn.setAttribute("aria-label", confirmLabel);
        timer = setTimeout(() => { armed = false; btn.classList.remove("armed"); btn.innerHTML = label; if (aria) btn.setAttribute("aria-label", aria); }, 4000);
        return;
      }
      clearTimeout(timer);
      await fn();
    };
  }
  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // รูปตัวอย่าง: กระดาษคำตอบวางเอียงบนโต๊ะ เขียนคำตอบตามเฉลย (ไว้ลองขั้นตอนโดยไม่ต้องมีกระดาษจริง)
  // รู้ตำแหน่งมุมกระดาษเพราะวาดเอง → ส่งเป็น guess (รูปจริงไม่มีค่านี้จนกว่าจะต่อโมเดล dewarp)
  const SAMPLE_CORNERS = [
    [[120, 110], [800, 150], [770, 1110], [90, 1060]],
    [[80, 160], [760, 90], [820, 1040], [140, 1120]],
    [[150, 80], [780, 120], [790, 1090], [120, 1130]],
  ];
  async function sampleSheet(exam, corners) {
    try { await document.fonts.load('600 40px "Mali"'); } catch {}
    const W = 900, H = 1200, cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    g.fillStyle = "#6b5a48"; g.fillRect(0, 0, W, H);                               // โต๊ะไม้
    g.save();
    g.beginPath(); corners.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = 30; g.fillStyle = "#fbfbf7"; g.fill();
    g.restore();
    // ช่องคำตอบ: วาดในพิกัดกระดาษแล้วแปลงแบบ bilinear ให้เอียงตามกระดาษ
    const map = (u, v) => {
      const [a, b, c, d] = corners;
      const top = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      const bot = [d[0] + (c[0] - d[0]) * u, d[1] + (c[1] - d[1]) * u];
      return [top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v];
    };
    g.strokeStyle = "#7d8a99"; g.lineWidth = 1.4;
    const cell = 0.8 / MAX_BOX, rh = 0.8 / MAX_Q; // แบบ Template 2: 20 ข้อ × 20 ช่อง (เขียนเฉพาะข้อที่มีในข้อสอบ)
    g.textAlign = "left"; g.textBaseline = "middle";
    for (let r = 0; r < MAX_Q; r++) { const [x, y] = map(0.05, 0.14 + r * rh + rh * 0.4); g.font = `${Math.round(rh * 520)}px sans-serif`; g.fillStyle = "#555"; g.fillText(String(r + 1), x, y); }
    g.textAlign = "center"; g.fillStyle = "#1d2a6b";
    for (let r = 0; r < MAX_Q; r++) {
      const word = exam.keys[1][r] || "";
      const v0 = 0.14 + r * rh;
      for (let k = 0; k < MAX_BOX; k++) {
        const u0 = 0.12 + k * cell;
        const q = [map(u0, v0), map(u0 + cell * 0.9, v0), map(u0 + cell * 0.9, v0 + rh * 0.8), map(u0, v0 + rh * 0.8)];
        g.beginPath(); q.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
        if (word[k]) {
          const [x, y] = map(u0 + cell * 0.45, v0 + rh * 0.42);
          g.font = `600 ${Math.round(rh * 1150 * 0.55)}px "Mali", cursive`;
          g.fillText(word[k], x, y);
        }
      }
    }
    const blob = await new Promise((ok) => cv.toBlob(ok, "image/jpeg", 0.9));
    return { blob, w: W, h: H, name: "ตัวอย่าง.jpg", guess: corners.map(([x, y]) => [x / W, y / H]), sample: true };
  }

  return {
    start() {
      $("#root").innerHTML = `
        <div class="m-app">
          <header class="m-bar" id="m-bar"></header>
          <main class="m-main" id="m-main"></main>
          <nav class="tabs" id="tabs">${TABS.map(([h, l, i]) => `<a href="${h}">${ico(i)}<span>${l}</span></a>`).join("")}</nav>
        </div>`;
      Router.add(/^#\/$/, guard(() => { location.hash = "#/check"; }));
      Router.add(/^#\/exams$/, guard(myExams));
      Router.add(/^#\/exams\/new$/, guard(newExam));
      Router.add(/^#\/edit\/(\w+)$/, guard(editHub));
      Router.add(/^#\/edit\/(\w+)\/info$/, guard(editInfo));
      Router.add(/^#\/edit\/(\w+)\/keys$/, guard(editKeys));
      Router.add(/^#\/edit\/(\w+)\/score$/, guard(editScore));
      Router.add(/^#\/check$/, guard(checkList));
      Router.add(/^#\/exam\/(\w+)$/, guard(examView));
      Router.add(/^#\/sheet\/(\w+)$/, guard(sheetView));
      Router.add(/^#\/check\/(\w+)\/(photo|crop|grade)$/, guard(flow));
      Router.add(/^#\/settings$/, guard(settingsView));
      if (Session.user()) Data.load().then(runModels); // ตรวจต่อแผ่นที่ค้างจากครั้งก่อน
    },
  };
})();
