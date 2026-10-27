// dashboard/dashboard.js — เว็บฝ่ายวิชาการ (back office) · sidebar: Dashboard · Application · ล่างสุด = เข้าสู่ระบบ
// Application = แอปครู (../app/) เปิดในกรอบมือถือ (iframe เว็บเดียวกัน → ข้อมูลในเครื่องใช้ร่วมกัน)
// หน้าย่อย Dashboard: ภาพรวม (คะแนนทุกการสอบ) · ห้องเรียน (รายชื่อ) · รายวิชาและครู (+ไฟล์สำหรับครู) · ข้อสอบกลาง
// ข้อมูล: shared/school.js (Store, examScores, Transfer) — ยังไม่มี server → ครูส่งคะแนนมาเป็นไฟล์ .json

const Dashboard = (() => {
  const NAV = [
    ["#/", "Dashboard", "grid"],
    ["#/app", "Application", "phone"],
  ];
  // หน้าย่อยของ Dashboard (แถบ header ด้านบน) · หน้าลึกกว่านั้น (#/classes/xxx) นับเป็นแท็บเดียวกัน
  const PAGES = [
    ["#/", "ภาพรวม"],
    ["#/classes", "ห้องเรียน"],
    ["#/subjects", "รายวิชาและครู"],
    ["#/central", "ข้อสอบกลาง"],
  ];
  const tabOf = (hash) => (hash === "#/" || hash.startsWith("#/result/") ? "#/" : PAGES.find(([h]) => h !== "#/" && hash.startsWith(h))?.[0]);
  let phoneHash = ""; // หน้าที่เปิดค้างในแอป เวลากลับมาที่ Application

  function shell() {
    $("#root").innerHTML = `
      <div class="dash">
        <aside class="side">
          <a class="side-brand brand" href="#/">${LOGO}<span><b>Examer</b><small>ฝ่ายวิชาการ</small></span></a>
          <nav class="side-nav">${NAV.map(([h, l, i]) => `<a href="${h}">${ico(i)}<span>${l}</span></a>`).join("")}</nav>
          <div class="side-account" id="account"></div>
        </aside>
        <main class="dash-main" id="main"></main>
      </div>`;
  }

  function renderAccount() {
    const u = Session.user();
    $("#account").innerHTML = u
      ? `<div class="acct">
           <button class="avatar" id="acct-btn" aria-label="บัญชีของ ${esc(u.name)}">${esc(u.name.slice(0, 1).toUpperCase())}</button>
           <div class="acct-pop"><span class="acct-name"><b>${esc(u.name)}</b><small>ฝ่ายวิชาการ</small></span>
             <button class="icon-btn" id="logout" title="ออกจากระบบ" aria-label="ออกจากระบบ">${ico("logout")}</button></div>
         </div>`
      : `<a class="btn primary block login-btn" href="#/login" aria-label="เข้าสู่ระบบ">${ico("user")}<span>เข้าสู่ระบบ</span></a>`;
    const out = $("#logout");
    if (out) out.onclick = () => { Session.logout(); renderAccount(); toast("ออกจากระบบแล้ว"); };
    const btn = $("#acct-btn"); // จอแคบ: แตะรูปเพื่อเปิดชื่อ + ปุ่มออกจากระบบ
    if (btn) btn.onclick = () => $("#account").classList.toggle("open");
  }

  function mark() {
    const hash = location.hash || "#/";
    const inDash = !!tabOf(hash);
    $$(".side-nav a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === (inDash ? "#/" : hash)));
  }

  // โครงหน้า Dashboard: header + แถบหน้าย่อย + เนื้อหา
  function page(html) {
    mark();
    const cur = tabOf(location.hash || "#/");
    $("#main").innerHTML = `
      <header class="dash-top">
        <h1>Dashboard</h1>
        <nav class="dash-tabs">${PAGES.map(([h, l]) => `<a href="${h}" class="${h === cur ? "active" : ""}" ${h === cur ? 'aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
      </header>
      <section class="dash-page">${html}</section>`;
    const tabs = $(".dash-tabs"), on = $(".dash-tabs .active"); // จอแคบ: แถบเลื่อนข้าง → ให้เห็นแท็บที่เลือก
    if (on && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = on.offsetLeft - tabs.offsetLeft - (tabs.clientWidth - on.offsetWidth) / 2;
  }
  const blank = (title, hint, action = "") => `
    <div class="blank">
      <div class="blank-grid" aria-hidden="true">${"<i></i>".repeat(12)}</div>
      <h3>${title}</h3>
      <p class="muted">${hint}</p>
      ${action ? `<div class="blank-act">${action}</div>` : ""}
    </div>`;
  const pickFile = (accept, fn) => `<label class="btn ghost">${ico("upload")}<span>${fn}</span><input type="file" accept="${accept}" hidden data-file /></label>`;

  // ---------- ข้อมูล ----------
  const all = async () => {
    const [exams, sheets, subs, classes, subjects] = await Promise.all(["exams", "sheets", "submissions", "classes", "subjects"].map((n) => Store.all(n)));
    return { exams: exams.filter((e) => e.format === SCHOOL_FORMAT), sheets: sheets.filter((s) => s.format === SCHOOL_FORMAT), subs, classes, subjects };
  };

  // รวมการสอบจาก 3 ที่: ไฟล์ที่ครูส่งมา · ที่ตรวจในเครื่องนี้ (แอปครูเว็บเดียวกัน) · ข้อสอบกลางที่ยังไม่มีคะแนน
  function overviewRows(d) {
    const rows = new Map();
    const subj = (code) => d.subjects.find((x) => x.code && x.code === code);
    for (const s of d.subs) {
      const e = s.exam;
      rows.set(e.id, { id: e.id, exam: e, teacher: s.teacher || subj(e.subjectCode)?.teacher || "", source: "file", at: s.sentAt,
        n: s.counts?.scored ?? s.students.filter((x) => x.score != null).length, total: s.students.length, mean: s.counts?.mean ?? null, max: s.max,
        review: s.counts?.review || 0, absent: s.counts?.absent || 0 });
    }
    for (const e of d.exams) {
      if (rows.has(e.id) || e.status === "draft") continue;
      const sheets = d.sheets.filter((x) => x.examId === e.id && x.saved);
      if (!sheets.length && !e.central) continue;
      const sum = sheets.length ? examScores(e, sheets, d.classes) : null;
      rows.set(e.id, { id: e.id, exam: e, teacher: subj(e.subjectCode)?.teacher || "", source: sheets.length ? "local" : "waiting",
        n: sum?.counts.scored || 0, total: sum ? sum.rows.length : examRoster(e, d.classes).length, mean: sum?.counts.mean ?? null, max: sum?.max,
        review: sum?.counts.review || 0, absent: sum?.counts.absent || 0 });
    }
    return [...rows.values()].sort((a, b) => (a.source === "waiting") - (b.source === "waiting") || String(b.exam.date || "").localeCompare(String(a.exam.date || "")));
  }

  const statusTag = (r) => r.source === "waiting" ? `<span class="tag">รอครูส่งคะแนน</span>`
    : r.review ? `<span class="tag warn">ไม่แน่ใจ ${r.review} คน</span>`
    : `<span class="tag ok">${r.source === "file" ? "ได้รับคะแนนแล้ว" : "ตรวจในเครื่องนี้"}</span>`;

  // ---------- ภาพรวม ----------
  async function overview() {
    const d = await all();
    const rows = overviewRows(d), st = Settings.get();
    const got = rows.filter((r) => r.source !== "waiting").length, wait = rows.length - got;
    page(`
      <div class="d-head">
        <div><h2>ภาพรวม</h2><p class="muted">${esc([st.schoolName, termLabel(st)].filter(Boolean).join(" · ") || termLabel(st))}
          <button class="link" id="school-edit">แก้ข้อมูลโรงเรียน</button></p></div>
        <div class="d-actions">${pickFile(".json,application/json", "นำเข้าไฟล์คะแนนจากครู")}</div>
      </div>
      <form class="d-card d-form" id="school-form" hidden>
        <label>ชื่อโรงเรียน<input name="schoolName" value="${esc(st.schoolName)}" placeholder="เช่น โรงเรียนบ้านหนองบัว" /></label>
        <label>ปีการศึกษา<input name="year" value="${esc(st.year)}" inputmode="numeric" maxlength="4" /></label>
        <label>ภาคเรียน<select name="term">${["1", "2"].map((t) => `<option ${st.term === t ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <button class="btn primary">บันทึก</button>
      </form>
      <div class="d-stats">
        <div><b>${d.classes.length}</b><span>ห้องเรียน</span></div>
        <div><b>${d.classes.reduce((a, c) => a + (c.students?.length || 0), 0)}</b><span>นักเรียน</span></div>
        <div><b>${got}</b><span>การสอบที่มีคะแนน</span></div>
        <div><b>${wait}</b><span>รอครูส่งคะแนน</span></div>
      </div>
      ${rows.length ? `
        <div class="d-card flush"><table class="d-table click">
          <thead><tr><th>การสอบ</th><th>วิชา</th><th>ห้อง</th><th>ครูผู้สอน</th><th class="num">ตรวจแล้ว</th><th class="num">เฉลี่ย</th><th>สถานะ</th></tr></thead>
          <tbody>${rows.map((r) => `<tr data-href="#/result/${r.id}" tabindex="0">
            <td><b>${esc(r.exam.name)}</b><small>${esc([examKindLabel(r.exam.kind), r.exam.central && "ข้อสอบกลาง", r.exam.date && thaiDateShort(r.exam.date)].filter(Boolean).join(" · "))}</small></td>
            <td>${esc([r.exam.subjectCode, r.exam.subject].filter(Boolean).join(" "))}</td>
            <td>${esc((r.exam.rooms || []).join(", "))}</td>
            <td>${esc(r.teacher)}</td>
            <td class="num">${r.source === "waiting" ? "–" : `${r.n}${r.total ? `/${r.total}` : ""}`}</td>
            <td class="num">${r.mean == null ? "–" : `${fmtNum(round1(r.mean))}<small>/${fmtNum(r.max)}</small>`}</td>
            <td>${statusTag(r)}</td></tr>`).join("")}</tbody>
        </table></div>` : blank("ยังไม่มีผลการสอบ", "ครูตรวจในแอปแล้วกด “ส่งคะแนนให้ฝ่ายวิชาการ” จะได้ไฟล์ .json มานำเข้าที่นี่ · หรือสร้างข้อสอบกลางให้ครูใช้ก่อน", `<a class="btn ghost" href="#/central/new">${ico("plus")}สร้างข้อสอบกลาง</a>`)}`);

    $("#school-edit").onclick = () => { const f = $("#school-form"); f.hidden = !f.hidden; if (!f.hidden) f.schoolName.focus(); };
    $("#school-form").onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      Settings.set({ schoolName: f.schoolName.value.trim(), year: f.year.value.trim(), term: f.term.value });
      toast("บันทึกข้อมูลโรงเรียนแล้ว");
      overview();
    };
    $("[data-file]").onchange = async (e) => {
      try {
        let n = 0;
        for (const f of e.target.files) { await Transfer.importResults(await readJsonFile(f)); n++; }
        toast(`นำเข้าคะแนน ${n} ไฟล์แล้ว`);
        overview();
      } catch (err) { toast(err.message); }
      e.target.value = "";
    };
    bindRows();
  }

  // ---------- คะแนนของการสอบ 1 ชุด ----------
  async function result(id) {
    const d = await all();
    const sub = d.subs.find((s) => s.id === id);
    const exam = sub?.exam || d.exams.find((e) => e.id === id);
    if (!exam) { location.hash = "#/"; return; }
    let rows, max, counts;
    if (sub) ({ students: rows, max, counts } = sub);
    else ({ rows, max, counts } = examScores(exam, d.sheets.filter((x) => x.examId === id && x.saved), d.classes));
    const src = sub ? `ครู${sub.teacher ? ` ${sub.teacher}` : ""} ส่งมาเมื่อ ${new Date(sub.sentAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}` : rows.length ? "ตรวจในเครื่องนี้ (แอปครูในเว็บเดียวกัน)" : "ยังไม่มีคะแนน — รอครูส่ง";
    const sorted = [...rows].sort((a, b) => String(a.room || "~").localeCompare(String(b.room || "~"), "th") || (a.no ?? 1e9) - (b.no ?? 1e9));
    const ST = { done: "", review: "warn", absent: "muted", unknown: "bad" };
    page(`
      <a class="d-back" href="#/">${ico("back")}ภาพรวม</a>
      <div class="d-head">
        <div><h2>${esc(exam.name)}</h2>
          <p class="muted">${esc([[exam.subjectCode, exam.subject].filter(Boolean).join(" "), examKindLabel(exam.kind), exam.date && thaiDateShort(exam.date), (exam.rooms || []).join(", ")].filter(Boolean).join(" · "))}</p>
          <p class="small muted">${esc(src)}</p></div>
        <div class="d-actions">${rows.length ? `<button class="btn primary" id="csv">${ico("download")}ไฟล์สำหรับ SGS / ปพ.5</button>` : ""}</div>
      </div>
      <div class="d-stats">
        <div><b>${counts?.scored ?? 0}</b><span>ตรวจแล้ว (คน)</span></div>
        <div><b>${counts?.mean == null ? "–" : fmtNum(round1(counts.mean))}</b><span>คะแนนเฉลี่ย (เต็ม ${fmtNum(max)})</span></div>
        <div><b>${counts?.absent ?? 0}</b><span>ไม่มีกระดาษ</span></div>
        <div><b>${(counts?.review || 0) + (counts?.unknown || 0)}</b><span>ต้องตรวจซ้ำ</span></div>
      </div>
      ${sorted.length ? `<div class="d-card flush"><table class="d-table">
        <thead><tr><th>ห้อง</th><th class="num">เลขที่</th><th>เลขประจำตัว</th><th>ชื่อ-สกุล</th><th class="num">คะแนน</th>${exam.scaleTo ? `<th class="num">คิดเป็น (${fmtNum(exam.scaleTo)})</th>` : ""}<th>หมายเหตุ</th></tr></thead>
        <tbody>${sorted.map((r) => `<tr class="${ST[r.status] || ""}">
          <td>${esc(r.room)}</td><td class="num">${r.no ?? ""}</td><td class="mono">${esc(r.sid || "–")}</td><td>${esc(r.name)}</td>
          <td class="num"><b>${r.score == null ? "–" : fmtNum(r.score)}</b></td>${exam.scaleTo ? `<td class="num">${r.scaled == null ? "–" : fmtNum(round1(r.scaled))}</td>` : ""}
          <td class="small">${esc(r.note || "")}</td></tr>`).join("")}</tbody>
      </table></div>` : blank("ยังไม่มีคะแนน", "เมื่อครูตรวจเสร็จและส่งไฟล์คะแนนมา นำเข้าได้ที่หน้าภาพรวม")}
      ${sub ? `<button class="link danger-link" id="del">${ico("trash")}ลบคะแนนที่นำเข้านี้</button>` : ""}`);
    const csv = $("#csv");
    if (csv) csv.onclick = () => downloadFile(new Blob([scoresCsv(exam, rows, max)], { type: "text/csv" }), `คะแนน-${safeName(exam.name)}.csv`);
    const del = $("#del");
    if (del) twoTap(del, "แตะอีกครั้งเพื่อลบ", async () => { await Store.del("submissions", id); toast("ลบแล้ว"); location.hash = "#/"; });
  }

  // ---------- ห้องเรียน ----------
  async function classes() {
    const cs = (await Store.all("classes")).sort(byRoom);
    page(`
      <div class="d-head">
        <div><h2>ห้องเรียน</h2><p class="muted">รายชื่อนักเรียนใช้จับคู่กับเลขประจำตัวที่ระบบอ่านจากกระดาษคำตอบ</p></div>
      </div>
      <form class="d-card d-form inline" id="add">
        <label>ชื่อห้อง<input name="name" placeholder="เช่น ม.3/1" required autocomplete="off" /></label>
        <button class="btn primary">${ico("plus")}เพิ่มห้อง</button>
      </form>
      ${cs.length ? `<div class="d-card flush"><table class="d-table click">
        <thead><tr><th>ห้อง</th><th>ระดับชั้น</th><th class="num">นักเรียน</th><th></th></tr></thead>
        <tbody>${cs.map((c) => `<tr data-href="#/classes/${c.id}" tabindex="0"><td><b>${esc(c.name)}</b></td><td>${esc(c.level || "")}</td>
          <td class="num">${c.students?.length || 0}</td><td class="num muted">${c.students?.length ? "" : "ยังไม่มีรายชื่อ"}</td></tr>`).join("")}</tbody>
      </table></div>` : blank("ยังไม่มีห้องเรียน", "เพิ่มห้อง แล้ววางรายชื่อนักเรียนจาก Excel หรือ SGS ได้เลย")}`);
    $("#add").onsubmit = async (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim().replace(/\s+/g, "");
      if (cs.some((c) => c.name === name)) { toast(`มีห้อง ${name} แล้ว`); return; }
      const c = { id: schoolId(), name, level: levelOf(name), students: [] };
      await Store.put("classes", c);
      location.hash = `#/classes/${c.id}`;
    };
    bindRows();
  }

  async function classView(id) {
    const c = await Store.get("classes", id);
    if (!c) { location.hash = "#/classes"; return; }
    const st = c.students || [];
    page(`
      <a class="d-back" href="#/classes">${ico("back")}ห้องเรียน</a>
      <div class="d-head">
        <div><h2>ห้อง ${esc(c.name)}</h2><p class="muted">${st.length ? `นักเรียน ${st.length} คน` : "ยังไม่มีรายชื่อ"}</p></div>
        <div class="d-actions">
          <label class="lv">ระดับชั้น<select id="level"><option value="">–</option>${GRADE_LEVELS.map((l) => `<option ${c.level === l ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        </div>
      </div>
      <div class="d-cols">
        <div class="d-card flush">${st.length ? `<table class="d-table">
          <thead><tr><th class="num">เลขที่</th><th>เลขประจำตัว</th><th>ชื่อ-สกุล</th></tr></thead>
          <tbody>${st.map((s) => `<tr><td class="num">${s.no}</td><td class="mono">${esc(s.sid)}</td><td>${esc(s.name)}</td></tr>`).join("")}</tbody>
        </table>` : `<p class="muted pad">วางรายชื่อทางขวาเพื่อเริ่ม</p>`}</div>
        <form class="d-card d-form" id="roster">
          <h3>${st.length ? "แทนรายชื่อทั้งหมด" : "ใส่รายชื่อ"}</h3>
          <p class="small muted">คัดลอกจาก Excel / SGS มาวางได้เลย บรรทัดละ 1 คน มี เลขที่ · เลขประจำตัว · ชื่อ-สกุล (เรียงแบบไหนก็ได้)</p>
          <textarea name="text" rows="9" placeholder="1&#9;12345&#9;ด.ช.สมชาย ใจดี&#10;2&#9;12346&#9;ด.ญ.สมหญิง รักเรียน"></textarea>
          <p class="small" id="preview"></p>
          <div class="row-btns">${pickFile(".csv,.txt,text/csv,text/plain", "เปิดไฟล์ CSV")}<button class="btn primary" id="save" disabled>บันทึกรายชื่อ</button></div>
        </form>
      </div>
      <button class="link danger-link" id="del">${ico("trash")}ลบห้องนี้</button>`);
    const f = $("#roster");
    let parsed = [];
    const show = () => {
      parsed = Roster.parse(f.text.value);
      const dup = parsed.length - new Set(parsed.map((s) => Roster.norm(s.sid))).size;
      $("#preview").innerHTML = f.text.value.trim() ? (parsed.length ? `พบ ${parsed.length} คน${dup ? ` · <span class="bad-t">เลขประจำตัวซ้ำ ${dup} คน</span>` : ""}` : `<span class="bad-t">ไม่พบเลขประจำตัว (ตัวเลข 4 หลักขึ้นไป)</span>`) : "";
      $("#save").disabled = !parsed.length;
    };
    f.text.oninput = show;
    $("[data-file]", f).onchange = async (e) => { const file = e.target.files[0]; if (file) { f.text.value = await file.text(); show(); } e.target.value = ""; };
    f.onsubmit = async (e) => { e.preventDefault(); c.students = parsed; await Store.put("classes", c); toast(`บันทึกรายชื่อ ${parsed.length} คนแล้ว`); classView(id); };
    $("#level").onchange = async (e) => { c.level = e.target.value; await Store.put("classes", c); toast("บันทึกแล้ว"); };
    twoTap($("#del"), "แตะอีกครั้งเพื่อลบห้องและรายชื่อ", async () => { await Store.del("classes", id); toast("ลบห้องแล้ว"); location.hash = "#/classes"; });
  }

  // ---------- รายวิชาและครู ----------
  async function subjects() {
    const [xs, cs] = await Promise.all([Store.all("subjects"), Store.all("classes")]);
    xs.sort((a, b) => String(a.code).localeCompare(String(b.code), "th"));
    const teachers = [...new Set(xs.map((x) => x.teacher).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
    page(`
      <div class="d-head">
        <div><h2>รายวิชาและครู</h2><p class="muted">ครูนำไฟล์ไปเปิดในแอป (ตั้งค่า › ข้อมูลจากฝ่ายวิชาการ) จะได้รายชื่อห้อง รายวิชา ข้อสอบกลาง และเกณฑ์ตรวจของโรงเรียน</p></div>
      </div>
      <form class="d-card d-form grid" id="add">
        <label>รหัสวิชา<input name="code" placeholder="อ23101" required autocomplete="off" /></label>
        <label>ชื่อวิชา<input name="name" placeholder="ภาษาอังกฤษ 5" required autocomplete="off" /></label>
        <label>ครูผู้สอน<input name="teacher" placeholder="ชื่อ-สกุลครู" list="tlist" autocomplete="off" /><datalist id="tlist">${teachers.map((t) => `<option value="${esc(t)}">`).join("")}</datalist></label>
        <label>ห้องที่สอน<input name="rooms" placeholder="ม.3/1, ม.3/2" list="clist" autocomplete="off" /><datalist id="clist">${cs.map((c) => `<option value="${esc(c.name)}">`).join("")}</datalist></label>
        <button class="btn primary">${ico("plus")}เพิ่มวิชา</button>
      </form>
      ${xs.length ? `<div class="d-card flush"><table class="d-table">
        <thead><tr><th>รหัสวิชา</th><th>ชื่อวิชา</th><th>ระดับชั้น</th><th>ครูผู้สอน</th><th>ห้อง</th><th></th></tr></thead>
        <tbody>${xs.map((x) => `<tr><td class="mono">${esc(x.code)}</td><td><b>${esc(x.name)}</b></td><td>${esc(x.level || "")}</td><td>${esc(x.teacher || "")}</td>
          <td>${esc((x.rooms || []).join(", "))}</td><td class="num"><button class="icon-btn sm" data-del="${x.id}" aria-label="ลบวิชา ${esc(x.code)}" title="ลบวิชา">${ico("trash")}</button></td></tr>`).join("")}</tbody>
      </table></div>
      <h3 class="d-sec">ไฟล์สำหรับครู</h3>
      <div class="d-card d-files">
        ${teachers.map((t) => `<button class="btn ghost" data-pkg="${esc(t)}">${ico("download")}${esc(t)}</button>`).join("")}
        <button class="btn ghost" data-pkg="">${ico("download")}ทุกวิชา</button>
      </div>` : blank("ยังไม่มีรายวิชา", "เพิ่มรายวิชาพร้อมครูผู้สอนด้านบน")}`);
    $("#add").onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const rooms = f.rooms.value.split(/[,\s]+/).map((r) => r.trim()).filter(Boolean);
      const code = f.code.value.trim();
      await Store.put("subjects", { id: schoolId(), code, name: f.name.value.trim(), teacher: f.teacher.value.trim(), rooms,
        level: levelOf(rooms[0] || "") });
      toast("เพิ่มวิชาแล้ว");
      subjects();
    };
    $$("[data-del]").forEach((b) => twoTap(b, "", async () => { await Store.del("subjects", b.dataset.del); subjects(); }));
    $$("[data-pkg]").forEach((b) => (b.onclick = async () => {
      const t = b.dataset.pkg, d = await Transfer.schoolPackage(t);
      downloadJson(d, `examer-ข้อมูลโรงเรียน-${safeName(t || "ทุกวิชา")}.json`);
      toast(`ไฟล์สำหรับ${t ? ` ${t}` : "ครูทุกคน"}: ${d.subjects.length} วิชา · ${d.classes.length} ห้อง · ข้อสอบกลาง ${d.exams.length} ชุด`);
    }));
  }

  // ---------- ข้อสอบกลาง ----------
  async function central() {
    const xs = (await Store.all("exams")).filter((e) => e.central && e.format === SCHOOL_FORMAT).sort((a, b) => b.createdAt - a.createdAt);
    page(`
      <div class="d-head">
        <div><h2>ข้อสอบกลาง</h2><p class="muted">ฝ่ายวิชาการตั้งเฉลยไว้ ครูทุกห้องใช้เฉลยเดียวกัน แก้เฉลยในแอปไม่ได้</p></div>
        <div class="d-actions"><a class="btn primary" href="#/central/new">${ico("plus")}สร้างข้อสอบกลาง</a></div>
      </div>
      ${xs.length ? `<div class="d-card flush"><table class="d-table click">
        <thead><tr><th>การสอบ</th><th>วิชา</th><th>ห้อง</th><th class="num">ข้อ</th><th class="num">คะแนนเต็ม</th></tr></thead>
        <tbody>${xs.map((e) => `<tr data-href="#/central/${e.id}" tabindex="0">
          <td><b>${esc(e.name)}</b><small>${esc([examKindLabel(e.kind), e.date && thaiDateShort(e.date), e.sets > 1 && `${e.sets} ชุด`].filter(Boolean).join(" · "))}</small></td>
          <td>${esc([e.subjectCode, e.subject].filter(Boolean).join(" "))}</td><td>${esc((e.rooms || []).join(", "))}</td>
          <td class="num">${e.n}</td><td class="num">${fmtNum(e.scaleTo || e.points.reduce((a, p) => a + p, 0))}</td></tr>`).join("")}</tbody>
      </table></div>` : blank("ยังไม่มีข้อสอบกลาง", "ใช้กับสอบกลางภาค/ปลายภาคที่ทุกห้องใช้ข้อสอบชุดเดียวกัน")}`);
    bindRows();
  }

  async function centralEdit(id) {
    const [subjectsL, cs] = await Promise.all([Store.all("subjects"), Store.all("classes")]);
    const isNew = id === "new";
    const e = isNew ? { id: schoolId(), format: SCHOOL_FORMAT, central: true, status: "ready", name: "", subject: "", subjectCode: "", kind: "midterm", date: "",
      rooms: [], n: 0, sets: 1, keys: { 1: [], 2: [], 3: [] }, points: [], scaleTo: null, createdAt: Date.now() } : await Store.get("exams", id);
    if (!e) { location.hash = "#/central"; return; }
    const used = isNew ? 0 : (await Store.all("sheets")).filter((s) => s.examId === id).length;
    page(`
      <a class="d-back" href="#/central">${ico("back")}ข้อสอบกลาง</a>
      <div class="d-head"><div><h2>${isNew ? "สร้างข้อสอบกลาง" : esc(e.name)}</h2>
        ${used ? `<p class="review-note">ครูในเครื่องนี้ตรวจไปแล้ว ${used} แผ่น — แก้เฉลยแล้วคะแนนจะคิดใหม่</p>` : ""}</div></div>
      <form class="d-card d-form grid" id="ef">
        <label class="wide">ชื่อการสอบ<input name="name" value="${esc(e.name)}" placeholder="เช่น สอบกลางภาค ภาษาอังกฤษ ม.3" required autocomplete="off" /></label>
        <label>วิชา<select name="subj"><option value="">– เลือกวิชา –</option>${subjectsL.map((x) => `<option value="${x.id}" ${x.code === e.subjectCode ? "selected" : ""}>${esc(x.code)} ${esc(x.name)}</option>`).join("")}</select></label>
        <label>ประเภท<select name="kind">${EXAM_KINDS.map(([v, l]) => `<option value="${v}" ${e.kind === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label>วันที่สอบ<input type="date" name="date" value="${esc(e.date || "")}" /></label>
        <label>คิดเป็นคะแนนเต็ม <small class="muted">(ไม่บังคับ)</small><input name="scaleTo" type="number" min="1" value="${e.scaleTo ?? ""}" placeholder="เช่น 20" /></label>
        <fieldset class="wide"><legend>ห้องที่สอบ</legend><div class="checks">${cs.sort(byRoom).map((c) => `<label class="chk"><input type="checkbox" name="room" value="${esc(c.name)}" ${e.rooms.includes(c.name) ? "checked" : ""} />${esc(c.name)}</label>`).join("") || `<span class="muted small">ยังไม่มีห้อง — เพิ่มที่แท็บห้องเรียน</span>`}</div></fieldset>
        <fieldset class="wide"><legend>เฉลย <small class="muted">บรรทัดละ 1 ข้อ ตัวอักษร A–Z ไม่เกิน 20 ตัว · สูงสุด 20 ข้อ</small></legend>
          <div class="keys">${[1, 2, 3].map((s) => `<label ${s > Math.max(1, e.sets) ? "data-more hidden" : ""}>ชุดที่ ${s}<textarea name="k${s}" rows="10" spellcheck="false" autocapitalize="characters">${esc((e.keys[s] || []).join("\n"))}</textarea><small class="kc muted"></small></label>`).join("")}</div>
          <button type="button" class="link" id="more" ${e.sets >= 3 ? "hidden" : ""}>${ico("plus")}เพิ่มชุดข้อสอบ</button>
        </fieldset>
        <p class="bad-t wide" id="err" hidden></p>
        <div class="wide row-btns"><button class="btn primary">${isNew ? "สร้างข้อสอบกลาง" : "บันทึก"}</button><a class="btn ghost" href="#/central">ยกเลิก</a></div>
      </form>
      ${isNew ? "" : `<button class="link danger-link" id="del">${ico("trash")}ลบข้อสอบกลางนี้</button>`}`);
    const f = $("#ef");
    const clean = (t) => t.split(/\r?\n/).map((w) => w.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 20)).filter(Boolean).slice(0, 20);
    const count = () => $$(".keys label:not([hidden])").forEach((l) => { const n = clean($("textarea", l).value).length; $(".kc", l).textContent = n ? `${n} ข้อ` : ""; });
    f.oninput = count; count();
    $("#more").onclick = () => { const next = $(".keys [data-more][hidden]"); if (next) next.hidden = false; if (!$(".keys [data-more][hidden]")) $("#more").hidden = true; count(); };
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const sets = $$(".keys label:not([hidden])").map((l) => clean($("textarea", l).value)).filter((k, i) => i === 0 || k.length);
      const n = sets[0].length;
      const err = !f.name.value.trim() ? "ใส่ชื่อการสอบ" : !n ? "ใส่เฉลยชุดที่ 1" : sets.some((k) => k.length !== n) ? `ทุกชุดต้องมีจำนวนข้อเท่ากัน (ชุดที่ 1 มี ${n} ข้อ)` : "";
      $("#err").hidden = !err; $("#err").textContent = err;
      if (err) return;
      const subj = subjectsL.find((x) => x.id === f.subj.value);
      Object.assign(e, {
        name: f.name.value.trim(), subject: subj?.name || "", subjectCode: subj?.code || "", kind: f.kind.value, date: f.date.value,
        rooms: $$('[name="room"]:checked', f).map((c) => c.value), n, sets: sets.length,
        keys: Object.fromEntries([1, 2, 3].map((s) => [s, sets[s - 1] || []])),
        points: Array.from({ length: n }, (_, i) => e.points[i] ?? 1), scaleTo: Number(f.scaleTo.value) || null, updatedAt: Date.now(),
      });
      delete e.work;
      await Store.put("exams", e);
      toast(isNew ? "สร้างข้อสอบกลางแล้ว — ส่งให้ครูด้วยไฟล์ในแท็บรายวิชาและครู" : "บันทึกแล้ว");
      location.hash = "#/central";
    };
    const del = $("#del");
    if (del) twoTap(del, "แตะอีกครั้งเพื่อลบ", async () => { await Store.deleteExam(id); toast("ลบแล้ว"); location.hash = "#/central"; });
  }

  // ---------- ตัวช่วย ----------
  const byRoom = (a, b) => String(a.name).localeCompare(String(b.name), "th", { numeric: true });
  const thaiDateShort = (iso) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }); } catch { return iso; } };
  // แถวตารางที่กดได้ (คลิก / Enter)
  const bindRows = () => $$("tr[data-href]").forEach((tr) => {
    tr.onclick = () => (location.hash = tr.dataset.href);
    tr.onkeydown = (e) => { if (e.key === "Enter") location.hash = tr.dataset.href; };
  });
  // ปุ่มที่ต้องกด 2 ครั้ง (กันลบพลาด)
  function twoTap(btn, text, fn) {
    let armed = false, t;
    const html = btn.innerHTML;
    btn.onclick = async () => {
      if (!armed) {
        armed = true; btn.classList.add("armed"); if (text) btn.textContent = text;
        t = setTimeout(() => { armed = false; btn.classList.remove("armed"); btn.innerHTML = html; }, 4000);
        return;
      }
      clearTimeout(t);
      await fn();
    };
  }

  function routes() {
    Router.add(/^#\/$/, overview);
    Router.add(/^#\/result\/(\w+)$/, result);
    Router.add(/^#\/classes$/, classes);
    Router.add(/^#\/classes\/(\w+)$/, classView);
    Router.add(/^#\/subjects$/, subjects);
    Router.add(/^#\/central$/, central);
    Router.add(/^#\/central\/(\w+)$/, centralEdit);

    // ---------- เข้าสู่ระบบ ----------
    Router.add(/^#\/login$/, () => {
      mark();
      if (Session.user()) { location.hash = "#/"; return; }
      $("#main").innerHTML = `<div class="login-wrap"><div class="login-card"></div></div>`;
      $(".login-card").append(loginForm({
        title: "เข้าสู่ระบบ Dashboard",
        hint: "สำหรับฝ่ายวิชาการ ดูผลการสอบของทั้งโรงเรียน",
        onDone: () => { renderAccount(); toast("เข้าสู่ระบบแล้ว"); location.hash = "#/"; },
      }));
      $(".login-card input").focus();
    });

    // ---------- Application: แอปครูในกรอบมือถือ ----------
    Router.add(/^#\/app$/, () => {
      mark();
      const src = "../app/" + phoneHash;
      $("#main").innerHTML = `
        <div class="phone-stage">
          <div class="phone-fit"><div class="phone">
            <div class="phone-screen">
              <div class="phone-status">
                <span id="ph-time"></span>
                <span class="phone-island"></span>
                <span class="phone-icons" aria-hidden="true">
                  <svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
                  <svg viewBox="0 0 16 12"><path d="M8 2.2c2.4 0 4.6.9 6.3 2.5l1.2-1.3A10.6 10.6 0 008 .4C5.2.4 2.6 1.5.5 3.4l1.2 1.3A9 9 0 018 2.2zm0 3.6c1.4 0 2.7.5 3.7 1.4l1.2-1.3A7.3 7.3 0 008 4c-1.8 0-3.5.7-4.9 1.9l1.2 1.3c1-.9 2.3-1.4 3.7-1.4zM8 9.4l-2.1-2.2a3 3 0 014.2 0z"/></svg>
                  <svg viewBox="0 0 27 12"><rect x=".5" y=".5" width="23" height="11" rx="3" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="17" height="8" rx="1.8"/><path d="M25 4v4a2 2 0 000-4z" opacity=".4"/></svg>
                </span>
              </div>
              <iframe id="phone-app" title="แอปครูผู้สอน" src="${src}"></iframe>
              <div class="phone-home"></div>
            </div>
          </div></div>
        </div>`;

      const tick = () => ($("#ph-time").textContent = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false }));
      tick();
      const timer = setInterval(tick, 15000);

      // จอในกรอบ = 390×844 เท่ามือถือจริง แล้วย่อทั้งเครื่องให้พอดีพื้นที่ · จอแคบ (มือถือจริง) ขยายเต็มความกว้าง
      const fit = () => {
        const box = $(".phone-fit");
        if (!box) return;
        const main = $("#main");
        const narrow = innerWidth <= 760;
        const byW = (main.clientWidth - (narrow ? 20 : 64)) / 414;
        const byH = (innerHeight - box.getBoundingClientRect().top - window.scrollY - 28) / 868;
        box.style.setProperty("--s", Math.max(0.5, narrow ? byW : Math.min(1, byW, byH)).toFixed(3));
      };
      fit();
      addEventListener("resize", fit);
      const frame = $("#phone-app");
      return () => {
        removeEventListener("resize", fit);
        clearInterval(timer);
        try { phoneHash = frame.contentWindow.location.hash; } catch {}
      };
    });
  }

  return {
    start() {
      routes();
      shell();
      renderAccount();
    },
  };
})();
