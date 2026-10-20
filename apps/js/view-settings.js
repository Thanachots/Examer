// ตั้งค่า

Views.settings = async (root) => {
  const s = Settings.get();
  const persistent = await Store.persistent();
  const radio = (name, opts) => opts.map(([v, l]) =>
    `<label class="radio"><input type="radio" name="${name}" value="${v}" ${s[name] === v ? "checked" : ""} />${l}</label>`).join("");

  root.innerHTML = `
    <div class="page-head"><div><h2>ตั้งค่า</h2></div></div>
    <form id="sf" class="card form narrow">
      <h3>ผู้ใช้</h3>
      <div class="two-fields">
        <label>ชื่อครู<input name="teacher" value="${esc(s.teacher)}" placeholder="เช่น สมศรี" /></label>
        <label>โรงเรียน<input name="school" value="${esc(s.school)}" /></label>
      </div>

      <h3>ระบบตรวจ</h3>
      ${radio("engine", [["browser", "โมเดลจริง (รันในเบราว์เซอร์)"], ["mock", "โหมดจำลอง (ทดสอบหน้าจอ)"]])}
      <div id="conn" class="conn muted small"></div>
      <p class="muted small">โมเดลรันในเครื่องนี้ทั้งหมด ภาพกระดาษไม่ถูกส่งออกไปไหน · ครั้งแรกต้องดาวน์โหลดประมาณ 40 MB แล้วเบราว์เซอร์จะจำไว้</p>

      <h3>ความมั่นใจขั้นต่ำ</h3>
      <label><span>ช่องที่ระบบมั่นใจต่ำกว่า <b id="lc-v" class="mono">${Math.round(s.lowConf * 100)}%</b> จะส่งให้ครูตรวจทาน</span>
        <input type="range" name="lowConf" min="0.3" max="0.95" step="0.05" value="${s.lowConf}" />
      </label>
      <p class="muted small">ตั้งสูง = ครูตรวจทานมากขึ้นแต่พลาดน้อยลง</p>

      <h3>เกณฑ์การตรวจ <span class="pill warn">ทีมยังต้องตกลงกัน</span></h3>
      <div class="field"><span>ตัวพิมพ์เล็ก</span>${radio("lowercase", [["upper", "นับเหมือนพิมพ์ใหญ่"], ["wrong", "ผิด"]])}</div>
      <div class="field"><span>เว้นช่องกลางคำ</span>${radio("gap", [["join", "ต่อกันเลย"], ["wrong", "ผิด"]])}</div>
      <div class="field"><span>ไม่เริ่มที่ช่องแรก</span>${radio("start", [["accept", "ยอมรับ"], ["wrong", "ผิด"]])}</div>
      <div class="field"><span>คะแนนบางส่วน</span>${radio("partial", [["word", "ถูกทั้งคำเท่านั้น"], ["letters", "ตามสัดส่วนตัวอักษรที่ถูก (ความยาวต้องเท่ากัน)"]])}</div>

      <div class="row"><span class="spacer"></span><button class="primary" type="submit">บันทึก</button></div>
    </form>
    <section class="card form narrow">
      <h3>ข้อมูล</h3>
      <p class="muted small">${persistent ? "ข้อมูลทั้งหมด (รายชื่อ, ภาพ, คะแนน) เก็บในเบราว์เซอร์ของเครื่องนี้เท่านั้น — ไม่ได้ส่งขึ้นอินเทอร์เน็ต" : "เบราว์เซอร์นี้ไม่ให้เก็บข้อมูลถาวร — ข้อมูลจะหายเมื่อปิดหน้า"}</p>
      <div class="row"><button id="wipe" class="ghost danger">ลบข้อมูลทั้งหมด</button></div>
    </section>`;

  const showConn = () => {
    const el = $("#conn");
    if (!el) return;
    const st = BrowserEngine.state();
    if (Settings.get().engine !== "browser") { el.innerHTML = `<span class="dot warn"></span> โหมดจำลอง — ผลอ่านเป็นข้อมูลสุ่ม`; return; }
    el.innerHTML = st.status === "ready" ? `<span class="dot ok"></span> โมเดลพร้อมใช้งาน`
      : st.status === "loading" ? `<span class="dot warn"></span> ${esc(st.text)} (${Math.round(st.p * 100)}%)`
      : st.status === "error" ? `<span class="dot bad"></span> โหลดไม่สำเร็จ: ${esc(st.error)} <button type="button" class="ghost small" id="eng-load">ลองใหม่</button>`
      : `<span class="dot"></span> ยังไม่ได้โหลด (จะโหลดเองตอนสแกน) <button type="button" class="ghost small" id="eng-load">โหลดตอนนี้</button>`;
    const btn = $("#eng-load");
    if (btn) btn.onclick = () => BrowserEngine.load().catch(() => {});
  };
  showConn();
  Page.onLeave(BrowserEngine.onChange(showConn));

  const range = $('[name="lowConf"]');
  range.oninput = () => ($("#lc-v").textContent = Math.round(range.value * 100) + "%");
  $("#sf").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    Settings.set({
      teacher: fd.get("teacher").trim(), school: fd.get("school").trim(),
      engine: fd.get("engine"), lowConf: Number(fd.get("lowConf")),
      lowercase: fd.get("lowercase"), gap: fd.get("gap"), start: fd.get("start"), partial: fd.get("partial"),
    });
    toast("บันทึกแล้ว");
    updateBadge();
    showConn();
  };
  armButton($("#wipe"), "กดอีกครั้งเพื่อลบทั้งหมด", async () => { await Store.clear(); toast("ลบแล้ว"); location.hash = "#/"; });
};
