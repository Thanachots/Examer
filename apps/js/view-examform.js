// ฟอร์มการสอบ — ใช้ทั้งครู (สร้างการสอบเอง) และฝ่ายวิชาการ (ข้อสอบกลาง)
// 3 ส่วน: ① วิชาและห้อง ② คะแนน ③ เฉลย

const keyToText = (arr) => (arr || []).join("\n").replace(/\n+$/, "");
const textToKey = (t) => {
  const lines = String(t || "").split(/\r?\n/).map((l) => l.replace(/^\s*\d+[.)\s-]*/, "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, COLS));
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.slice(0, 4 * ROWS);
};

async function renderExamForm(root, exam, opts) {
  const { title, back, central = false, readonlyKey = false, onSaved, onDelete } = opts;
  const s = Settings.get();
  const subjects = (await Store.all("subjects")).sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const classes = (await Store.all("classes")).sort((a, b) => String(a.name).localeCompare(String(b.name), "th"));
  const multiSet = SETS.filter((n) => (exam.keys?.[n] || []).some(Boolean)).length > 1;

  root.innerHTML = `
    <div class="page-head"><div><a class="back" href="${back}">${ico("back")}กลับ</a><h2>${esc(title)}</h2>
      <p class="muted">${esc(termLabel(exam.year ? exam : s))}</p></div></div>
    <form id="xf" class="form wizard">
      <section class="card">
        <h3><span class="num">1</span> วิชาและห้องที่สอบ</h3>
        ${subjects.length ? `
          <label>รายวิชา
            <select name="subjectId" ${readonlyKey ? "disabled" : ""}>
              <option value="">— เลือกรายวิชา —</option>
              ${subjects.map((x) => `<option value="${x.id}" ${exam.subjectId === x.id ? "selected" : ""}>${esc(x.code)} ${esc(x.name)}${x.grade ? " (" + esc(x.grade) + ")" : ""}</option>`).join("")}
              <option value="__other" ${exam.subjectId === "" && exam.subject ? "selected" : ""}>อื่นๆ (พิมพ์เอง)</option>
            </select>
          </label>` : ""}
        <div class="two-fields" id="subj-free" ${subjects.length && exam.subjectId !== "" ? "hidden" : ""}>
          <label>ชื่อวิชา<input name="subject" value="${esc(exam.subject)}" placeholder="เช่น ภาษาอังกฤษ 5" ${readonlyKey ? "disabled" : ""} /></label>
          <label>รหัสวิชา<input name="subjectCode" value="${esc(exam.subjectCode)}" placeholder="เช่น อ23101" ${readonlyKey ? "disabled" : ""} /></label>
        </div>
        <div class="field-label">ประเภท</div>
        <div class="chips">${Object.entries(EXAM_KINDS).map(([k, l]) =>
          `<label class="chip"><input type="radio" name="kind" value="${k}" ${(exam.kind || "quiz") === k ? "checked" : ""} ${readonlyKey ? "disabled" : ""} /><span>${l}</span></label>`).join("")}</div>
        <label>ชื่อที่จะแสดง<input name="name" value="${esc(exam.name)}" required placeholder="เช่น สอบกลางภาค ภาษาอังกฤษ 5" ${readonlyKey ? "disabled" : ""} /></label>
        <div class="field-label">ห้องที่สอบ</div>
        ${classes.length ? `<div class="chips" id="rooms">${classes.map((c) => `
          <label class="chip"><input type="checkbox" name="classIds" value="${c.id}" ${(exam.classIds || []).includes(c.id) ? "checked" : ""} ${readonlyKey ? "disabled" : ""} />
          <span>${esc(c.name)} <small>${(c.students || []).length} คน</small></span></label>`).join("")}</div>`
          : `<p class="muted small">ยังไม่มีรายชื่อห้องเรียน — ข้ามได้ ระบบจะใช้เลขประจำตัวบนกระดาษแทนชื่อ${s.role === "admin" ? ` · <a href="#/class/new">เพิ่มห้องเรียน</a>` : " · รายชื่อมาจากไฟล์ของฝ่ายวิชาการ (ตั้งค่า › นำเข้า)"}</p>`}
        <label>วันที่สอบ<input type="date" name="date" value="${esc(exam.date || "")}" ${readonlyKey ? "disabled" : ""} /></label>
      </section>

      <section class="card">
        <h3><span class="num">2</span> คะแนน</h3>
        <div class="two-fields">
          <label>คิดเป็นคะแนนเต็ม (ที่บันทึกลง SGS / ปพ.5)
            <input name="weight" type="number" min="0" step="0.5" value="${esc(exam.weight ?? "")}" placeholder="เว้นว่าง = ใช้จำนวนข้อ" ${readonlyKey ? "disabled" : ""} />
            <small class="muted">เช่น 20 ข้อ คิดเป็นคะแนนเก็บ 10 คะแนน → ใส่ 10</small>
          </label>
          <label>จำนวนหน้ากระดาษคำตอบ
            <select name="pages" ${readonlyKey ? "disabled" : ""}>${[1, 2, 3, 4].map((n) => `<option value="${n}" ${(exam.pages || 1) === n ? "selected" : ""}>${n} หน้า (${n * ROWS} ข้อ)</option>`).join("")}</select>
          </label>
        </div>
      </section>

      <section class="card">
        <h3><span class="num">3</span> เฉลย ${readonlyKey ? `<span class="pill muted">จากฝ่ายวิชาการ</span>` : ""}</h3>
        ${readonlyKey ? `<p class="muted small">ข้อสอบกลาง — เฉลยกำหนดโดยฝ่ายวิชาการ แก้ไม่ได้ในเครื่องครู</p>`
          : `<p class="muted small">พิมพ์หรือวางจาก Word/Excel ได้เลย <b>บรรทัดละ 1 ข้อ</b> เรียงจากข้อ 1 · มีเลขข้อนำหน้าก็ได้ · บรรทัดว่าง = ข้อนั้นไม่นับคะแนน</p>`}
        <label class="check-line"><input type="checkbox" id="multi" ${multiSet ? "checked" : ""} ${readonlyKey ? "disabled" : ""} /> ข้อสอบมีหลายชุด (ชุดที่ 1–3 ตามวงกลมบนกระดาษ)</label>
        <div class="set-tabs" id="set-tabs" ${multiSet ? "" : "hidden"}>${SETS.map((n) => `<button type="button" class="set-tab ${n === 1 ? "active" : ""}" data-set="${n}">ชุดที่ ${n}</button>`).join("")}</div>
        <div class="key-edit">
          <textarea id="ktext" rows="10" spellcheck="false" placeholder="CAT&#10;VISION&#10;MODEL&#10;…" ${readonlyKey ? "readonly" : ""}></textarea>
          <div id="kprev" class="key-preview"></div>
        </div>
      </section>

      <div class="form-actions">
        ${onDelete ? `<button type="button" id="del" class="ghost danger">ลบ</button>` : ""}
        <span class="spacer"></span>
        ${readonlyKey ? `<a class="btn primary" href="${back}">กลับ</a>` : `<button class="primary big" type="submit">${exam.id ? "บันทึก" : "บันทึกแล้วไปถ่ายรูป →"}</button>`}
      </div>
    </form>`;

  // ----- วิชา → เติมชื่อ / เลือกห้องระดับเดียวกันให้ -----
  const f = $("#xf");
  const el = (n) => f.elements.namedItem(n);
  const nameEl = el("name"), subjFree = el("subject"), pagesEl = el("pages");
  const subjSel = el("subjectId");
  const autoName = () => {
    if (readonlyKey) return;
    const sub = subjects.find((x) => x.id === subjSel?.value);
    const subjName = sub ? sub.name : subjFree.value.trim();
    const kind = EXAM_KINDS[el("kind").value] || "";
    if (!nameEl.dataset.touched) nameEl.value = [kind, subjName].filter(Boolean).join(" ");
  };
  nameEl.addEventListener("input", () => (nameEl.dataset.touched = "1"));
  if (exam.name) nameEl.dataset.touched = "1";
  $$('[name="kind"]', f).forEach((r) => r.addEventListener("change", autoName));
  subjFree.addEventListener("input", autoName);
  if (subjSel) subjSel.onchange = () => {
    $("#subj-free").hidden = subjSel.value !== "__other";
    const sub = subjects.find((x) => x.id === subjSel.value);
    if (sub?.grade && !(exam.classIds || []).length) {
      $$('[name="classIds"]', f).forEach((cb) => {
        const cls = classes.find((c) => c.id === cb.value);
        cb.checked = Boolean(cls && String(cls.name).startsWith(sub.grade));
      });
    }
    autoName();
  };

  // ----- เฉลย -----
  const keys = Object.fromEntries(SETS.map((n) => [n, [...(exam.keys?.[n] || [])]]));
  let set = 1;
  const ta = $("#ktext");
  const preview = () => {
    const k = textToKey(ta.value);
    keys[set] = k;
    const pages = Number(pagesEl.value) || 1;
    const n = k.filter(Boolean).length;
    const over = k.length > pages * ROWS;
    $("#kprev").innerHTML = `<div class="kp-head"><b>${n}</b> ข้อ${over ? ` <span class="bad-text">· เกิน ${pages * ROWS} ข้อ (เพิ่มจำนวนหน้า)</span>` : ""}</div>` +
      k.map((w, i) => `<div class="kp-row ${w ? "" : "muted"}"><span>${i + 1}</span><b class="mono">${w || "—"}</b></div>`).join("");
  };
  const loadSet = () => { ta.value = keyToText(keys[set]); preview(); };
  ta.addEventListener("input", preview);
  pagesEl.addEventListener("change", preview);
  $("#multi").onchange = (e) => { $("#set-tabs").hidden = !e.target.checked; if (!e.target.checked) { set = 1; $$(".set-tab").forEach((x, i) => x.classList.toggle("active", i === 0)); loadSet(); } };
  $$(".set-tab").forEach((b) => (b.onclick = () => { set = Number(b.dataset.set); $$(".set-tab").forEach((x) => x.classList.toggle("active", x === b)); loadSet(); }));
  loadSet();

  const del = $("#del");
  if (del) armButton(del, "กดอีกครั้งเพื่อลบ", onDelete);

  f.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const sid = fd.get("subjectId");
    const sub = subjects.find((x) => x.id === sid);
    if (!keys[1].some(Boolean) && !keys[2].some(Boolean) && !keys[3].some(Boolean)) {
      if (!confirmLike("ยังไม่ได้ใส่เฉลย — บันทึกไว้ก่อนแล้วค่อยใส่ทีหลังได้", "#ktext")) return;
    }
    Object.assign(exam, {
      name: fd.get("name").trim(),
      subjectId: sub ? sub.id : "",
      subject: sub ? sub.name : (fd.get("subject") || "").trim(),
      subjectCode: sub ? sub.code : (fd.get("subjectCode") || "").trim(),
      grade: sub?.grade || exam.grade || "",
      kind: fd.get("kind") || "quiz",
      classIds: fd.getAll("classIds"),
      date: fd.get("date") || "",
      weight: fd.get("weight") ? Number(fd.get("weight")) : null,
      pages: Number(fd.get("pages")) || 1,
      year: exam.year || s.year,
      term: exam.term || s.term,
      central,
      keys: Object.fromEntries(SETS.map((n) => [n, $("#multi").checked || n === 1 ? keys[n] : []])),
    });
    if (!exam.id) Object.assign(exam, { id: uid(), createdAt: Date.now(), createdBy: s.role === "admin" ? "admin" : s.teacherName });
    await Store.put("exams", exam);
    toast("บันทึกแล้ว");
    onSaved(exam);
  };
}

// แจ้งเตือนครั้งแรก กดบันทึกซ้ำ = ยืนยัน (แทน confirm() ที่หน้าตาไม่เป็นมิตร)
function confirmLike(msg, focusSel) {
  const k = "_confirm_" + msg;
  if (confirmLike[k]) { delete confirmLike[k]; return true; }
  confirmLike[k] = true;
  toast(msg + " (กดบันทึกอีกครั้งเพื่อยืนยัน)");
  if (focusSel) $(focusSel)?.focus();
  setTimeout(() => delete confirmLike[k], 5000);
  return false;
}
