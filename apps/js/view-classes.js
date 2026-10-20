// ห้องเรียน — รายชื่อนักเรียนใช้ซ้ำได้ทุกการสอบ

Views.classes = async (root) => {
  const classes = (await Store.all("classes")).sort((a, b) => String(a.name).localeCompare(String(b.name), "th"));
  root.innerHTML = `
    <div class="page-head">
      <div><h2>ห้องเรียน</h2><p class="muted">รายชื่อนักเรียนสำหรับจับคู่กับรหัสบนกระดาษคำตอบ — เพิ่มครั้งเดียว ใช้ได้ทุกการสอบ</p></div>
      <a class="btn primary" href="#/class/new">+ เพิ่มห้องเรียน</a>
    </div>
    ${classes.length ? `<div class="cards">${classes.map((c) => `
      <a class="card class-card" href="#/class/${c.id}">
        <h3>${esc(c.name)}</h3>
        <p class="muted small">${c.year ? "ปีการศึกษา " + esc(c.year) : ""}</p>
        <div class="big mono">${(c.students || []).length}<span class="muted small"> คน</span></div>
      </a>`).join("")}</div>`
      : `<div class="empty-state"><h3>ยังไม่มีห้องเรียน</h3><p class="muted">เพิ่มห้องแรก แล้ววางรายชื่อจาก Excel ได้เลย</p><a class="btn primary" href="#/class/new">+ เพิ่มห้องเรียน</a></div>`}`;
};

Views.classEdit = async (root, id) => {
  const isNew = id === "new";
  const cls = isNew ? { id: uid(), name: "", year: String(new Date().getFullYear() + 543), students: [], createdAt: Date.now() } : await Store.get("classes", id);
  if (!cls) return (root.innerHTML = `<div class="empty-state"><h3>ไม่พบห้องเรียน</h3><a href="#/classes">กลับ</a></div>`);
  let students = [...(cls.students || [])];

  root.innerHTML = `
    <div class="page-head"><div><a class="back" href="#/classes">${ico("back")}ห้องเรียน</a><h2>${isNew ? "เพิ่มห้องเรียน" : esc(cls.name)}</h2></div></div>
    <form id="cf" class="card form">
      <div class="two-fields">
        <label>ชื่อห้อง<input name="name" value="${esc(cls.name)}" placeholder="เช่น ม.3/2" required /></label>
        <label>ปีการศึกษา<input name="year" value="${esc(cls.year)}" inputmode="numeric" /></label>
      </div>
      <h3>รายชื่อนักเรียน <span class="muted small" id="n">${students.length} คน</span></h3>
      <details ${students.length ? "" : "open"}>
        <summary>วางรายชื่อจาก Excel / Google Sheets</summary>
        <p class="muted small">คัดลอกคอลัมน์ <b>เลขที่ · เลขประจำตัวนักเรียน · ชื่อ-สกุล</b> (ลำดับใดก็ได้, มีหัวตารางก็ได้) แล้ววางในกล่องนี้</p>
        <textarea id="paste" rows="6" placeholder="1&#9;24301&#9;ด.ช. กันต์ ใจดี&#10;2&#9;24302&#9;ด.ญ. ณิชา สุขสม"></textarea>
        <div class="row"><button type="button" id="add" class="ghost">เพิ่มจากที่วาง</button><button type="button" id="replace" class="ghost">แทนที่รายชื่อทั้งหมด</button>
          <label class="ghost btn file-btn">นำเข้าไฟล์ CSV<input id="csv" type="file" accept=".csv,text/csv" hidden /></label></div>
      </details>
      <div id="list"></div>
      <div class="row">
        ${isNew ? "" : `<button type="button" id="del" class="ghost danger">ลบห้องนี้</button>`}
        <span class="spacer"></span>
        <button class="primary" type="submit">บันทึก</button>
      </div>
    </form>`;

  const renderList = () => {
    $("#n").textContent = `${students.length} คน`;
    const dup = new Set(students.map((s) => Roster.norm(s.sid)).filter((v, i, a) => a.indexOf(v) !== i));
    $("#list").innerHTML = students.length ? `
      <table class="table compact">
        <thead><tr><th>เลขที่</th><th>เลขประจำตัว</th><th>ชื่อ-สกุล</th><th></th></tr></thead>
        <tbody>${students.map((s, i) => `<tr class="${dup.has(Roster.norm(s.sid)) ? "dup" : ""}">
          <td><input class="mini" data-i="${i}" data-k="no" value="${esc(s.no)}" inputmode="numeric" /></td>
          <td><input class="mini mono" data-i="${i}" data-k="sid" value="${esc(s.sid)}" inputmode="numeric" /></td>
          <td><input data-i="${i}" data-k="name" value="${esc(s.name)}" /></td>
          <td><button type="button" class="icon" data-rm="${i}" title="ลบ" aria-label="ลบ">${ico("x")}</button></td></tr>`).join("")}</tbody>
      </table>
      ${dup.size ? `<p class="bad-text small">มีเลขประจำตัวซ้ำ (แถวสีแดง) — ระบบจะจับคู่กระดาษผิดคน</p>` : ""}
      <button type="button" id="add-one" class="ghost small">+ เพิ่มทีละคน</button>`
      : `<p class="muted">ยังไม่มีรายชื่อ</p>`;
    $$("#list input").forEach((el) => (el.oninput = () => { students[el.dataset.i][el.dataset.k] = el.dataset.k === "no" ? Number(el.value) || null : el.value.trim(); }));
    $$("[data-rm]").forEach((b) => (b.onclick = () => { students.splice(b.dataset.rm, 1); renderList(); }));
    const one = $("#add-one");
    if (one) one.onclick = () => { students.push({ no: students.length + 1, sid: "", name: "" }); renderList(); };
  };
  renderList();

  const merge = (list, replace) => {
    if (!list.length) return toast("ไม่พบรายชื่อ — ต้องมีเลขประจำตัวอย่างน้อย 4 หลักในแต่ละบรรทัด");
    if (replace) students = list;
    else {
      const have = new Set(students.map((s) => Roster.norm(s.sid)));
      students.push(...list.filter((s) => !have.has(Roster.norm(s.sid))));
      students.sort((a, b) => a.no - b.no);
    }
    $("#paste").value = "";
    renderList();
    toast(`เพิ่ม ${list.length} คน`);
  };
  $("#add").onclick = () => merge(Roster.parse($("#paste").value), false);
  $("#replace").onclick = () => merge(Roster.parse($("#paste").value), true);
  $("#csv").onchange = async (e) => { const f = e.target.files[0]; if (f) merge(Roster.parse(await f.text()), false); };
  const del = $("#del");
  if (del) armButton(del, "กดอีกครั้งเพื่อลบห้อง", async () => { await Store.del("classes", cls.id); location.hash = "#/classes"; });

  $("#cf").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    cls.name = fd.get("name").trim();
    cls.year = fd.get("year").trim();
    cls.students = students.filter((s) => s.sid);
    await Store.put("classes", cls);
    toast("บันทึกแล้ว");
    const back = sessionStorageGet("examer.returnTo");
    location.hash = back || "#/classes";
  };
};

function sessionStorageGet(k) {
  try { const v = sessionStorage.getItem(k); sessionStorage.removeItem(k); return v; } catch { return null; }
}
function sessionStorageSet(k, v) {
  try { sessionStorage.setItem(k, v); } catch {}
}
