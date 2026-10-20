// app/app.js — แอปครูผู้สอน — ต้องเข้าสู่ระบบก่อน · แท็บล่าง: สร้างข้อสอบ · ตรวจข้อสอบ · ตั้งค่า
// ตรวจข้อสอบ 3 ขั้น: 1 ถ่ายภาพ → 2 ครอบภาพ → 3 ตรวจข้อสอบ (ทีละหลายแผ่นได้ · รองรับไฟล์ iPhone ผ่าน photos.js)
//
// ใช้ระบบเดิมของ Prame (อยู่ใน shared/):
//   store.js    — Store (IndexedDB: ข้อสอบ + กระดาษคำตอบพร้อมรูป → รีเฟรช/ปิดแอปแล้วไม่หาย) · Settings (เกณฑ์ตรวจ)
//   pipeline.js — mockResult (ผลอ่านจำลอง: ความมั่นใจรายช่อง ตัวเลือก 3 อันดับ ตัวพิมพ์เล็ก ขีดฆ่า เลขประจำตัว)
//                 Grade (ให้คะแนนตามเกณฑ์ตรวจ + ข้อที่ระบบไม่แน่ใจ)
// ยังไม่ต่อโมเดลจริง — ขั้นตรวจจำลองเวลาของโมเดล 3 ตัว (ดู runModels)

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
    let ready = null;
    const load = () => (ready ||= (async () => {
      // ย้ายข้อสอบจากต้นแบบรอบก่อน (localStorage) เข้า IndexedDB
      const old = Local.get("examer.proto.exams", null);
      if (old) { for (const e of old) await Store.put("exams", { id: e.id, format: FORMAT, name: e.name, key: e.key, createdAt: e.createdAt }); Local.del("examer.proto.exams"); }
      for (const s of await Store.all("sheets")) if (s.format === FORMAT) sheets.set(s.id, s);
    })());
    const byTime = (a, b) => a.createdAt - b.createdAt;
    return {
      load,
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
      async delSheet(id) { const u = urls.get(id); if (u) URL.revokeObjectURL(u); urls.delete(id); sheets.delete(id); await Store.del("sheets", id); },
      url(s) { if (!urls.has(s.id)) urls.set(s.id, URL.createObjectURL(s.image)); return urls.get(s.id); },
      async clear() { for (const e of await this.exams()) await this.delExam(e.id); },
    };
  })();
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const KINDS = [["quiz", "สอบย่อย"], ["midterm", "กลางภาค"], ["final", "ปลายภาค"]];
  const kindLabel = (k) => KINDS.find(([v]) => v === k)?.[1] || "";
  // ข้อสอบจากต้นแบบรอบก่อน ({ key: [...] }) → รูปแบบใหม่ ({ n, sets, keys: {1,2,3}, points })
  function normExam(e) {
    if (e.keys) return e;
    const key = e.key || [];
    return { ...e, n: key.length, sets: 1, keys: { 1: key, 2: [], 3: [] }, points: key.map(() => 1), scaleTo: null, kind: "quiz", rooms: [] };
  }
  const examMax = (e) => e.points.reduce((a, p) => a + p, 0);

  // ---------- คะแนน (เกณฑ์ตรวจของ Prame: Grade ใน pipeline.js) ----------
  const asExam = (exam) => ({ keys: Object.fromEntries([1, 2, 3, 4].map((s) => [s, s <= exam.sets ? exam.keys[s] || [] : []])) });
  // คะแนนต่อข้อ = (ถูกทั้งคำ 1 / ได้บางส่วน 0–1 ตามเกณฑ์) × คะแนนของข้อนั้น · ครูสั่งนับถูก/ผิดได้
  function gradeOf(s, exam) {
    const g = Grade.sheet({ result: s.result, setOverride: s.setOverride }, asExam(exam), Settings.get());
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
  const num = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const thaiDate = (iso) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }); } catch { return iso; } };
  const studentOf = (s) => s.studentId ?? s.result?.student_id ?? "";

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
  const ALL_SETS = [1, 2, 3, 4];
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const blankWork = () => ({ name: "", subject: "", subjectCode: "", kind: "quiz", date: today(), rooms: [], n: 10, sets: 1, keys: { 1: [], 2: [], 3: [], 4: [] }, points: [], scaleTo: null });
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
        const tag = !isReady(e) ? `<span class="tag draft">ร่าง</span>` : e.work && !sameAsSaved(e, w) ? `<span class="tag edit">แก้ไขค้างไว้</span>` : "";
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

  // ขั้น / หัวข้อ 1: การสอบ
  async function editInfo(id) {
    const e = await Data.exam(id);
    if (!e) { location.hash = "#/exams"; return; }
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
        <input id="room-in" placeholder="${w.rooms.length ? "เพิ่มห้อง" : "เช่น ม.3/1"}" autocomplete="off" enterkeyhint="done" />`;
      $$("[data-rr]").forEach((b) => (b.onclick = () => { w.rooms.splice(Number(b.dataset.rr), 1); save(); drawRooms(); }));
      const inp = $("#room-in");
      const add = () => { const v = inp.value.replace(/,/g, "").trim(); inp.value = ""; if (v && !w.rooms.includes(v)) w.rooms.push(v); save(); drawRooms(); $("#room-in").focus(); };
      inp.oninput = (ev) => ev.stopPropagation();
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
    const gs = saved.map((s) => ({ s, g: gradeOf(s, exam) }));
    const max = examMax(exam);
    const mean = gs.length ? gs.reduce((a, x) => a + x.g.score, 0) / gs.length : 0;
    const meta = [exam.subjectCode && exam.subject ? `${exam.subjectCode} ${exam.subject}` : exam.subject || exam.subjectCode, kindLabel(exam.kind),
      exam.date && thaiDate(exam.date), exam.rooms?.length && exam.rooms.join(", "), exam.sets > 1 && `${exam.sets} ชุด`].filter(Boolean);
    view(`
      ${meta.length ? `<p class="ex-meta">${esc(meta.join(" · "))}</p>` : ""}
      <section class="ex-sum">
        <div><b>${saved.length}</b><span>แผ่นที่ตรวจแล้ว</span></div>
        <div><b>${gs.length ? num(mean) : "–"}</b><span>คะแนนเฉลี่ย (เต็ม ${num(max)})</span></div>
      </section>
      ${exam.scaleTo ? `<p class="small muted ex-scale">${exam.n} ข้อ ${num(max)} คะแนน คิดเป็นคะแนนเต็ม ${num(exam.scaleTo)}${gs.length ? ` · เฉลี่ย ${num((mean * exam.scaleTo) / max)}` : ""}</p>` : ""}
      <a class="btn primary block" href="#/check/${id}/photo">${ico("camera")}${left ? `ตรวจต่อ (ค้าง ${left} แผ่น)` : "ตรวจข้อสอบ"}</a>
      <a class="btn ghost block" href="#/edit/${id}">${ico("pencil")}แก้ไขข้อสอบ</a>
      ${gs.length ? `
        <h2 class="sec-h">คะแนน</h2>
        <ul class="score-list">${gs.map(({ s, g }, i) => `
          <li><a href="#/sheet/${s.id}">
            <img src="${Data.url(s)}" alt="" />
            <span class="ex-t"><b>${studentOf(s) ? `เลขประจำตัว ${esc(studentOf(s))}` : `แผ่นที่ ${i + 1}`}</b>
              <small>${g.review ? `<em>ระบบไม่แน่ใจ ${g.review} ข้อ</em>` : "ตรวจแล้ว"}</small></span>
            <span class="sc">${num(g.score)}/${num(g.max)}</span>
          </a></li>`).join("")}
        </ul>
        <button class="btn ghost block" id="csv">${ico("download")}ส่งออกคะแนน (CSV)</button>` : `<p class="muted center ex-none">ยังไม่มีกระดาษที่ตรวจแล้ว</p>`}
      <button class="link danger-link" id="del">${ico("trash")}ลบข้อสอบนี้</button>`, { title: exam.name, back: "#/check" });

    const csv = $("#csv");
    if (csv) csv.onclick = () => {
      const rows = [["แผ่นที่", "เลขประจำตัว", "ชุด", "คะแนน", "คะแนนเต็ม", ...(exam.scaleTo ? [`คิดเป็น (เต็ม ${num(exam.scaleTo)})`] : []), "ข้อที่ระบบไม่แน่ใจ"],
        ...gs.map(({ s, g }, i) => [i + 1, studentOf(s), g.set, num(g.score), num(g.max), ...(exam.scaleTo ? [num(g.scaled)] : []), g.review])];
      const text = "﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n"); // BOM → Excel อ่านภาษาไทยได้
      download(new Blob([text], { type: "text/csv" }), `คะแนน-${exam.name}.csv`);
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
        <img src="${Data.url(x)}" alt="" /><span class="strip-n">${i + 1}</span>${badge(x)}
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
            <li><img src="${Data.url(x)}" alt="แผ่นที่ ${i + 1}" /><span class="strip-n">${i + 1}</span>
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
    const add = async (list) => {
      let t = Date.now();
      for (const x of list) await Data.putSheet({ id: uid(), format: FORMAT, examId: exam.id, image: x.blob, w: x.w, h: x.h, name: x.name, guess: x.guess || null,
        corners: null, done: false, result: null, overrides: {}, saved: false, createdAt: t++ });
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
    view(`${stepper}
      <div class="step-body">
        ${strip(items, i, (x) => (x.done ? `<span class="strip-ok">✓</span>` : ""))}
        <p class="m-lead"><b>แผ่นที่ ${i + 1}${items.length > 1 ? ` จาก ${items.length}` : ""}</b> <span class="muted">ลากจุดทั้ง 4 ให้ตรงมุมกระดาษ</span></p>
        <div class="crop" id="crop" style="aspect-ratio:${it.w} / ${it.h}; --ar:${(it.w / it.h).toFixed(4)}">
          <img src="${Data.url(it)}" alt="" draggable="false" />
          <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><path class="crop-shade" fill-rule="evenodd"/><polygon class="crop-edge"/></svg>
          ${pts.map((_, k) => `<button class="handle" data-i="${k}" aria-label="มุมที่ ${k + 1}"></button>`).join("")}
        </div>
        <div class="step-actions row">
          <button class="btn ghost" id="reset">คืนค่ามุม</button>
          <button class="btn primary grow" id="ok">${left ? `ยืนยัน · แผ่นถัดไป` : `ตรวจข้อสอบ${items.length > 1 ? ` ${items.length} แผ่น` : ""}`}${ico("next")}</button>
        </div>
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
    $$("[data-go]").forEach((b) => (b.onclick = () => { curIdx[exam.id] = Number(b.dataset.go); cropStep(exam, stepper, opts); }));
    $("#ok").onclick = async () => {
      Object.assign(it, { corners: pts, done: true, result: null, overrides: {} }); // ครอบใหม่ → ตรวจใหม่
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
    ["ตัดครอบภาพ", "ปรับกระดาษให้ตรงตามมุมที่ครอบไว้"],
    ["จับช่องคำตอบ", `หาช่องคำตอบ ${MAX_Q} ข้อ × ${MAX_BOX} ช่อง`],
    ["อ่านลายมือ", "อ่านตัวอักษรทีละช่อง"],
  ];
  const STAGE_MS = [700, 600, 1100]; // เวลาจำลองต่อขั้น
  let gradeUI = null;                // หน้าตรวจที่เปิดอยู่ — ให้ตัวรันโมเดลอัปเดตหน้าจอ
  let running = false;

  // รันโมเดลทีละแผ่นที่ครอบแล้วแต่ยังไม่มีผล (ทุกข้อสอบ) · ปิดแอปกลางคันแล้วเปิดใหม่ → ตรวจต่อจากแผ่นที่ค้าง (แบบคิวของ Prame)
  // it.run = { stage: ขั้นที่ทำอยู่ 0–2, p: ความคืบหน้าของขั้นนั้น 0–1 }
  // ต่อโมเดลจริง: แทนลูปจำลองด้วยการเรียก engine แล้วรายงาน stage/p ผ่าน it.run + progress(it) · ผลต้องเป็นรูปแบบเดียวกับ mockResult
  async function runModels() {
    if (running) return;
    running = true;
    const progress = (it, finished) => gradeUI?.progress(it, finished);
    try {
      for (let it; (it = Data.all().find((x) => x.done && !x.saved && !x.result)); ) {
        const exam = await Data.exam(it.examId);
        if (!exam) { await Data.delSheet(it.id); continue; }
        for (let s = 0; s < MODEL_STAGES.length; s++) {
          it.run = { stage: s, p: 0 };
          const t0 = performance.now();
          while (it.run.p < 1) {
            await new Promise((r) => setTimeout(r, 60));
            if (!Data.sheet(it.id) || !it.done) break; // ถูกลบ/ครอบใหม่ระหว่างตรวจ
            it.run.p = Math.min(1, (performance.now() - t0) / STAGE_MS[s]);
            progress(it);
          }
          if (!Data.sheet(it.id) || !it.done) break;
        }
        if (!Data.sheet(it.id) || !it.done) { it.run = null; continue; }
        it.result = mockResult(asExam(exam), { page: 1 });
        it.run = null;
        await Data.putSheet(it);
        progress(it, true);
      }
    } finally { running = false; }
  }

  function gradeStep(exam, stepper, opts) {
    const items = Data.pending(exam.id);
    const doneN = () => items.filter((x) => x.result).length;
    const runningAt = () => items.findIndex((x) => !x.result);

    const badge = (x) => {
      if (x.result) { const g = gradeOf(x, exam); return `<span class="strip-b strip-sc ${g.review ? "rv" : ""}">${num(g.score)}/${g.max}</span>`; }
      return x.run ? `<span class="strip-b strip-run" aria-label="กำลังตรวจ"></span>` : `<span class="strip-b strip-wait">รอ</span>`;
    };

    const summary = () => {
      const n = items.length, d = doneN(), r = runningAt();
      const run = r >= 0 ? items[r].run : null;
      const pct = ((d + (run ? (run.stage + run.p) / MODEL_STAGES.length : 0)) / n) * 100;
      const text = d === n ? `ตรวจครบ ${n} แผ่นแล้ว`
        : `กำลังตรวจ${n > 1 ? `แผ่นที่ ${r + 1} จาก ${n}` : ""}${run ? ` · ${MODEL_STAGES[run.stage][0]}` : ""}`;
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
      ${!it.run && r >= 0 && items[r] !== it ? `<p class="muted small center">รอคิว — กำลังตรวจแผ่นที่ ${r + 1} อยู่</p>` : ""}</div>`;
    };

    const saveLabel = () => doneN() === items.length ? `บันทึกคะแนน${items.length > 1 ? ` ${items.length} แผ่น` : ""}` : `รอตรวจให้ครบ (${doneN()}/${items.length})`;

    function render() {
      const i = Math.min(curIdx[exam.id] || 0, items.length - 1), it = items[i];
      view(`${stepper}
        <div class="step-body">
          ${strip(items, i, badge)}
          <div class="run-sum" id="sum">${summary()}</div>
          ${it.result ? `<div id="res"></div>` : `<div class="run-photo"><img src="${Data.url(it)}" alt="แผ่นที่ ${i + 1}" /></div>${stages(it)}`}
          <div class="step-actions"><button class="btn primary block" id="save" ${doneN() === items.length ? "" : "disabled"}>${saveLabel()}</button></div>
        </div>`, opts);
      if (it.result) resultPanel($("#res"), it, exam, () => { const b = $(`[data-go="${i}"] .strip-b`); if (b) b.outerHTML = badge(it); });
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
      if (!cur.result && $("#stages")) $("#stages").outerHTML = stages(cur);
      items.forEach((x, j) => {
        const b = $(`[data-go="${j}"] .strip-b`);
        if (b && !b.classList.contains(x.result ? "strip-sc" : x.run ? "strip-run" : "strip-wait")) b.outerHTML = badge(x);
      });
      const save = $("#save");
      save.disabled = doneN() !== items.length;
      save.textContent = saveLabel();
    }

    gradeUI = { progress };
    render();
    runModels();
  }

  // ---------- ผลตรวจ 1 แผ่น (ใช้ทั้งขั้นตรวจและหน้าดูผล) ----------
  // แตะข้อ → เปิดแก้: แตะตัวอักษรที่อ่านผิดแล้วเลือกตัวที่ถูก (ตัวเลือกจากโมเดล 3 อันดับ / พิมพ์เอง / ลบ) · หรือสั่งนับถูก/ผิดทั้งข้อ
  function resultPanel(el, s, exam, onChange = () => {}) {
    let openQ = null, selC = null;
    const lowConf = () => Settings.get().lowConf;
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
          <label class="sid">เลขประจำตัว<input id="sid" value="${esc(studentOf(s))}" inputmode="numeric" autocomplete="off" /></label>
        </div>
        ${exam.sets > 1 ? `<div class="set-pick"><span class="small muted">ชุดข้อสอบ${s.setOverride ? " (ครูเลือก)" : " (อ่านจากกระดาษ)"}</span>
          <div class="seg" role="radiogroup">${Array.from({ length: exam.sets }, (_, k) => `<button data-set-o="${k + 1}" class="${g.set === k + 1 ? "on" : ""}" role="radio" aria-checked="${g.set === k + 1}">ชุดที่ ${k + 1}</button>`).join("")}</div></div>` : ""}
        ${g.review ? `<p class="review-note">ระบบไม่แน่ใจ ${g.review} ข้อ — แตะข้อที่มี ? เพื่อตรวจ</p>` : ""}
        <p class="sim-note">ผลจำลอง — ยังไม่ได้ต่อโมเดลจริง</p>
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
      return `<div class="row-edit">
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
    function bind() {
      $("#sid", el).onchange = (e) => { s.studentId = e.target.value.trim(); Data.putSheet(s); };
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
  function settingsView() {
    const u = Session.user();
    const st = Settings.get();
    const seg = (name, opts) => `<div class="seg" role="radiogroup">${opts.map(([v, l]) =>
      `<button type="button" data-set="${name}" data-v="${v}" class="${st[name] === v ? "on" : ""}" role="radio" aria-checked="${st[name] === v}">${l}</button>`).join("")}</div>`;
    view(`
      <section class="m-card acct">
        <span class="avatar lg">${esc(u.name.slice(0, 1).toUpperCase())}</span>
        <span class="acct-name"><b>${esc(u.name)}</b><small>ครูผู้สอน</small></span>
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

      <h2 class="sec-h">ข้อมูลในเครื่อง</h2>
      <section class="m-card list">
        <button id="backup">${ico("download")}สำรองข้อมูล</button>
        <label class="file-row">${ico("upload")}กู้คืนจากไฟล์สำรอง<input type="file" accept=".json,application/json" hidden id="restore" /></label>
        <button id="wipe" class="danger">${ico("trash")}ลบข้อสอบและคะแนนทั้งหมด</button>
      </section>
      <p class="small muted pad">ข้อสอบ รูป และคะแนนเก็บในเครื่องนี้เท่านั้น ไม่ได้ส่งไปที่ไหน — สำรองไว้ก่อนเปลี่ยนเครื่องหรือล้างเบราว์เซอร์</p>

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
      const exams = await Data.exams();
      const sheets = await Promise.all(Data.all().map(async (s) => ({ ...s, image: await blobToData(s.image) })));
      const json = JSON.stringify({ app: "examer", type: "backup", format: FORMAT, at: new Date().toISOString(), exams, sheets });
      download(new Blob([json], { type: "application/json" }), `examer-สำรอง-${new Date().toISOString().slice(0, 10)}.json`);
    };
    $("#restore").onchange = async (e) => {
      try {
        const data = JSON.parse(await e.target.files[0].text());
        if (data.app !== "examer" || data.format !== FORMAT) throw new Error("ไม่ใช่ไฟล์สำรองของแอปนี้");
        for (const x of data.exams || []) await Data.saveExam(x);
        for (const s of data.sheets || []) await Data.putSheet({ ...s, image: await (await fetch(s.image)).blob() });
        toast(`กู้คืนแล้ว: ${(data.exams || []).length} ข้อสอบ · ${(data.sheets || []).length} แผ่น`);
      } catch (err) { toast("กู้คืนไม่สำเร็จ: " + err.message); }
      e.target.value = "";
    };
    armButton($("#wipe"), "แตะอีกครั้งเพื่อลบทั้งหมด", async () => { await Data.clear(); toast("ลบข้อสอบและคะแนนแล้ว"); });
    $("#logout").onclick = () => { Session.logout(); location.hash = "#/"; Router.go(); };
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
  const blobToData = (b) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });

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
    return { blob, w: W, h: H, name: "ตัวอย่าง.jpg", guess: corners.map(([x, y]) => [x / W, y / H]) };
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
