// ตั้งค่า — แยกตามบทบาท (ครู / ฝ่ายวิชาการ)

const RULE_TEXT = {
  lowercase: { upper: "นับเหมือนพิมพ์ใหญ่", wrong: "ผิด" },
  gap: { join: "ต่อกันเลย", wrong: "ผิด" },
  start: { accept: "ยอมรับ", wrong: "ผิด" },
  partial: { word: "ถูกทั้งคำเท่านั้น", letters: "ตามสัดส่วนตัวอักษรที่ถูก" },
};

Views.settings = async (root) => {
  const s = Settings.get();
  const admin = s.role === "admin";
  const persistent = await Store.persistent();
  const radio = (name, opts) => opts.map(([v, l]) =>
    `<label class="radio"><input type="radio" name="${name}" value="${v}" ${s[name] === v ? "checked" : ""} />${l}</label>`).join("");
  const rulesLocked = !admin && s.rulesFromSchool;

  root.innerHTML = `
    <div class="page-head"><div><h2>ตั้งค่า</h2><p class="muted">ใช้งานในฐานะ <b>${admin ? "ฝ่ายวิชาการ" : "ครูผู้สอน"}</b> · <button id="switch" class="link-btn">เปลี่ยนเป็น${admin ? "ครูผู้สอน" : "ฝ่ายวิชาการ"}</button></p></div></div>

    <form id="sf" class="form narrow">
      <section class="card">
        <h3>${admin ? "ข้อมูลโรงเรียน" : "ข้อมูลของฉัน"}</h3>
        ${admin ? "" : `<label>ชื่อครู<input name="teacherName" value="${esc(s.teacherName)}" /></label>`}
        <label>ชื่อโรงเรียน<input name="schoolName" value="${esc(s.schoolName)}" ${!admin && s.rulesFromSchool ? "readonly" : ""} /></label>
        <div class="two-fields">
          <label>ปีการศึกษา<input name="year" value="${esc(s.year)}" inputmode="numeric" ${admin ? "" : "readonly"} /></label>
          <label>ภาคเรียน<select name="term" ${admin ? "" : "disabled"}>${["1", "2", "3"].map((t) => `<option value="${t}" ${s.term === t ? "selected" : ""}>${t === "3" ? "ฤดูร้อน" : t}</option>`).join("")}</select></label>
        </div>
        ${admin ? "" : `<p class="muted small">ปีการศึกษา/ภาคเรียนมาจากฝ่ายวิชาการ</p>`}
      </section>

      ${admin ? "" : `<section class="card">
        <h3>ข้อมูลจากฝ่ายวิชาการ</h3>
        <p class="muted small">ไฟล์ที่ฝ่ายวิชาการส่งมา (รายชื่อนักเรียน, รายวิชา, ข้อสอบกลาง, เกณฑ์ตรวจ) — นำเข้าซ้ำได้เมื่อได้ไฟล์ใหม่</p>
        <label class="ghost btn file-btn">นำเข้าไฟล์จากฝ่ายวิชาการ<input id="pkg" type="file" accept=".json,application/json" hidden /></label>
        <span id="pkg-msg" class="small muted"></span>
      </section>`}

      <section class="card">
        <h3>เกณฑ์ตรวจ ${rulesLocked ? `<span class="pill muted">กำหนดโดยฝ่ายวิชาการ</span>` : admin ? `<span class="pill warn">ใช้ทั้งโรงเรียน</span>` : ""}</h3>
        ${rulesLocked ? `<ul class="rules-ro">
            <li>ตัวพิมพ์เล็ก: <b>${RULE_TEXT.lowercase[s.lowercase]}</b></li>
            <li>เว้นช่องกลางคำ: <b>${RULE_TEXT.gap[s.gap]}</b></li>
            <li>ไม่เริ่มที่ช่องแรก: <b>${RULE_TEXT.start[s.start]}</b></li>
            <li>คะแนนบางส่วน: <b>${RULE_TEXT.partial[s.partial]}</b></li>
            <li>ส่งให้ครูตรวจเมื่อระบบมั่นใจต่ำกว่า <b>${Math.round(s.lowConf * 100)}%</b></li></ul>`
          : `
        <div class="field"><span>ตัวพิมพ์เล็ก</span>${radio("lowercase", [["upper", RULE_TEXT.lowercase.upper], ["wrong", "ผิด"]])}</div>
        <div class="field"><span>เว้นช่องกลางคำ</span>${radio("gap", [["join", RULE_TEXT.gap.join], ["wrong", "ผิด"]])}</div>
        <div class="field"><span>ไม่เริ่มที่ช่องแรก</span>${radio("start", [["accept", RULE_TEXT.start.accept], ["wrong", "ผิด"]])}</div>
        <div class="field"><span>คะแนนบางส่วน</span>${radio("partial", [["word", RULE_TEXT.partial.word], ["letters", RULE_TEXT.partial.letters + " (ความยาวต้องเท่ากัน)"]])}</div>
        <label><span>ให้ครูตรวจเอง เมื่อระบบมั่นใจต่ำกว่า <b id="lc-v" class="mono">${Math.round(s.lowConf * 100)}%</b></span>
          <input type="range" name="lowConf" min="0.3" max="0.95" step="0.05" value="${s.lowConf}" />
          <small class="muted">ตั้งสูง = ครูตรวจมากขึ้น แต่พลาดน้อยลง</small>
        </label>`}
      </section>

      <section class="card">
        <h3>ระบบตรวจ</h3>
        ${radio("engine", [["browser", "ระบบตรวจจริง (ทำงานในเครื่องนี้)"], ["mock", "โหมดทดลอง (ผลสุ่ม ไว้ดูหน้าจอ)"]])}
        <div id="conn" class="conn muted small"></div>
        <p class="muted small">รูปกระดาษตรวจในเครื่องนี้ทั้งหมด ไม่ถูกส่งออกไปไหน · ครั้งแรกต้องดาวน์โหลดประมาณ 40 MB (ใช้ Wi-Fi)</p>
      </section>

      <div class="form-actions"><span class="spacer"></span><button class="primary big" type="submit">บันทึก</button></div>
    </form>

    <section class="card form narrow">
      <h3>สำรองข้อมูล</h3>
      <p class="muted small">${persistent ? "ข้อมูลทั้งหมดอยู่ในเบราว์เซอร์ของเครื่องนี้เท่านั้น" : "เบราว์เซอร์นี้ไม่ให้เก็บข้อมูลถาวร — ข้อมูลจะหายเมื่อปิดหน้า"} ·
        ถ้าล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนเครื่อง ข้อมูลจะหาย <b>ควรสำรองหลังตรวจเสร็จแต่ละครั้ง</b> · ไฟล์มีชื่อและคะแนนนักเรียน เก็บให้ปลอดภัย</p>
      <div class="row">
        <button id="bk-lite" class="ghost">สำรอง (ไม่รวมรูป)</button>
        <button id="bk-full" class="ghost">สำรอง + รูป</button>
        <label class="ghost btn file-btn">กู้คืนจากไฟล์สำรอง<input id="restore" type="file" accept=".json,application/json" hidden /></label>
      </div>
      <p id="bk-status" class="muted small"></p>
      <div class="row"><span class="spacer"></span><button id="wipe" class="ghost danger">ลบข้อมูลทั้งหมดในเครื่องนี้</button></div>
    </section>`;

  // ----- ระบบตรวจ -----
  const showConn = () => {
    const el = $("#conn");
    if (!el) return;
    const st = BrowserEngine.state();
    if (Settings.get().engine !== "browser") { el.innerHTML = `<span class="dot warn"></span> โหมดทดลอง — ผลอ่านเป็นข้อมูลสุ่ม`; return; }
    el.innerHTML = st.status === "ready" ? `<span class="dot ok"></span> พร้อมใช้งาน`
      : st.status === "loading" ? `<span class="dot warn"></span> ${esc(st.text)} (${Math.round(st.p * 100)}%)`
      : st.status === "error" ? `<span class="dot bad"></span> เตรียมไม่สำเร็จ: ${esc(st.error)} <button type="button" class="ghost small" id="eng-load">ลองใหม่</button>`
      : `<span class="dot"></span> จะเตรียมเองตอนถ่ายรูปครั้งแรก <button type="button" class="ghost small" id="eng-load">เตรียมตอนนี้</button>`;
    const btn = $("#eng-load");
    if (btn) btn.onclick = () => BrowserEngine.load().catch(() => {});
  };
  showConn();
  Page.onLeave(BrowserEngine.onChange(showConn));

  const range = $('[name="lowConf"]');
  if (range) range.oninput = () => ($("#lc-v").textContent = Math.round(range.value * 100) + "%");

  $("#switch").onclick = () => { Settings.set({ role: admin ? "teacher" : "admin" }); renderNav(); location.hash = "#/"; router(); };

  const pkg = $("#pkg");
  if (pkg) pkg.onchange = async (e) => {
    try {
      const n = await Transfer.importPackage(await readJsonFile(e.target.files[0]));
      toast(`นำเข้าแล้ว: ${n.classes} ห้อง · ${n.subjects} วิชา · ${n.exams} ข้อสอบกลาง`);
      renderNav();
      router();
    } catch (err) { $("#pkg-msg").textContent = err.message; }
  };

  $("#sf").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const patch = { engine: fd.get("engine") };
    if (fd.has("teacherName")) patch.teacherName = fd.get("teacherName").trim();
    if (fd.has("schoolName")) patch.schoolName = fd.get("schoolName").trim();
    if (admin) Object.assign(patch, { year: fd.get("year").trim(), term: fd.get("term") });
    if (!rulesLocked) Object.assign(patch, { lowConf: Number(fd.get("lowConf")), lowercase: fd.get("lowercase"), gap: fd.get("gap"), start: fd.get("start"), partial: fd.get("partial") });
    Settings.set(patch);
    updateBadge();
    renderNav();
    showConn();
    toast("บันทึกแล้ว");
  };

  // ----- สำรอง / กู้คืน -----
  const bkStatus = (t) => ($("#bk-status").textContent = t);
  const blobToDataURL = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
  async function backup(withImages) {
    bkStatus("กำลังเตรียมไฟล์…");
    const sheets = [];
    for (const sh of await Store.all("sheets")) {
      const o = { ...sh };
      if (withImages && sh.image) o.image = await blobToDataURL(sh.image);
      else { delete o.image; if (o.result?.images) o.result = { ...o.result, images: undefined }; }
      sheets.push(o);
    }
    const data = { app: "examer", type: "backup", version: 2, exportedAt: new Date().toISOString(), withImages, settings: Settings.get() };
    for (const n of ["classes", "subjects", "teachers", "exams", "submissions"]) data[n] = await Store.all(n);
    data.sheets = sheets;
    download(`Examer_สำรอง_${new Date().toISOString().slice(0, 10)}${withImages ? "_มีรูป" : ""}.json`, JSON.stringify(data), "application/json");
    bkStatus(`สำรองแล้ว: ${data.exams.length} การสอบ · ${sheets.length} แผ่น`);
  }
  $("#bk-lite").onclick = () => backup(false);
  $("#bk-full").onclick = () => backup(true);
  $("#restore").onchange = async (e) => {
    try {
      const data = await readJsonFile(e.target.files[0]);
      if (data.app !== "examer" || (data.type && data.type !== "backup")) throw new Error("ไม่ใช่ไฟล์สำรองของ Examer");
      for (const n of ["classes", "subjects", "teachers", "exams", "submissions"]) for (const x of data[n] || []) await Store.put(n, x);
      for (const sh of data.sheets || []) {
        if (typeof sh.image === "string" && sh.image.startsWith("data:")) sh.image = await (await fetch(sh.image)).blob();
        await Store.put("sheets", sh);
      }
      bkStatus(`กู้คืนแล้ว: ${(data.exams || []).length} การสอบ · ${(data.sheets || []).length} แผ่น`);
      toast("กู้คืนเรียบร้อย");
    } catch (err) {
      bkStatus("กู้คืนไม่สำเร็จ: " + err.message);
    }
    e.target.value = "";
  };
  armButton($("#wipe"), "กดอีกครั้งเพื่อลบทั้งหมด", async () => { await Store.clear(); Settings.set({ role: "" }); renderNav(); toast("ลบแล้ว"); location.hash = "#/"; router(); });
};
