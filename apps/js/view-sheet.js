// กระดาษแผ่นเดียว — ดูภาพ 3 ขั้น, แก้ช่องด้วยคีย์บอร์ด, จับคู่นักเรียน

Views.sheet = async (root, id) => {
  const sheet = await Store.get("sheets", id);
  if (!sheet) return (root.innerHTML = `<div class="empty-state"><h3>ไม่พบกระดาษแผ่นนี้</h3><a href="#/">กลับหน้าแรก</a></div>`);
  const ctx = await loadExamContext(sheet.examId);
  const { exam, sum } = ctx;
  const order = sum.sheets.map((i) => i.sheet.id);
  const idx = order.indexOf(id);
  const prev = order[idx - 1], next = order[idx + 1];
  const info = sum.sheets[idx];
  const back = `#/exam/${exam.id}/${info.issues.length || info.grade?.lowCells ? "review" : "scan"}`;

  let img = null, dewarped = null;
  try { img = await loadImage(sheet.image); } catch {}
  if (rectifiedSrc(sheet)) { try { dewarped = await loadImage(rectifiedSrc(sheet)); } catch {} }

  const head = `
    <div class="page-head">
      <div>
        <a class="back" href="${back}">← ${esc(exam.name)}</a>
        <h2>${info.student ? esc(studentLabel(info.student)) : "แผ่นที่ " + (idx + 1)} <span class="muted small">${idx + 1}/${order.length} · ${esc(sheet.fileName)}</span></h2>
      </div>
      <div class="row">
        <a class="btn ghost ${prev ? "" : "disabled"}" href="${prev ? "#/sheet/" + prev : "#"}">← ก่อนหน้า</a>
        <a class="btn ghost ${next ? "" : "disabled"}" href="${next ? "#/sheet/" + next : "#"}">ถัดไป →</a>
      </div>
    </div>`;

  if (sheet.error) {
    root.innerHTML = head + `
      <div class="notice bad">ตรวจแผ่นนี้ไม่ได้: ${esc(sheet.error)}</div>
      <section class="card"><canvas id="cv"></canvas>
        <div class="row"><button id="retry" class="primary">ลองตรวจใหม่</button><button id="rm" class="ghost danger">ลบแผ่นนี้</button></div>
        <p class="muted small">สาเหตุที่พบบ่อย: มองไม่เห็นสี่เหลี่ยมดำครบ 3 มุม, ภาพมืด/เบลอ, ถ่ายเอียงมาก — ลองถ่ายใหม่แล้วอัปโหลดอีกครั้ง</p>
      </section>`;
    if (img) drawImage($("#cv"), img);
    $("#retry").onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = "กำลังตรวจ…";
      try { sheet.result = await Pipeline.run(sheet.image, exam); delete sheet.error; } catch (err) { sheet.error = err.message; }
      await Store.put("sheets", sheet); router();
    };
    armButton($("#rm"), "ลบ?", async () => { await Store.del("sheets", sheet.id); location.hash = back; });
    return;
  }

  const r = sheet.result;
  const roster = sum.students;
  let sel = { r: 0, c: 0 };
  let stage = "after";
  const q = r.quality;

  root.innerHTML = head + `
    ${info.issues.length ? `<div class="notice bad">${esc(info.issues.map((i) => i.text).join(" · "))}</div>` : ""}
    <div class="sheet-layout">
      <section class="card">
        <div class="seg">
          <button data-stage="before">ภาพที่ถ่าย</button>
          <button data-stage="after">ตัดขอบแล้ว</button>
          <button data-stage="cells">ช่องที่จับได้</button>
        </div>
        <canvas id="cv"></canvas>
        <p id="stage-note" class="muted small"></p>
      </section>
      <section>
        <div class="card meta">
          <label class="span2">นักเรียน
            ${roster.length && sum.counts.roster ? `<select id="sid">
                <option value="">— ไม่ระบุ —</option>
                ${roster.map((s) => `<option value="${esc(s.sid)}" ${info.student && Roster.norm(info.student.sid) === Roster.norm(s.sid) ? "selected" : ""}>${esc(studentLabel(s))}${s.room ? " (" + esc(s.room) + ")" : ""}</option>`).join("")}
              </select>`
              : `<input id="sid" class="mono" value="${esc(info.sid)}" inputmode="numeric" />`}
            <small class="muted">อ่านจากกระดาษ: <span class="mono">${esc(r.student_id || "—")}</span>${r.header?.student_id?.review ? " · ไม่มั่นใจ" : ""}</small>
          </label>
          <label>ชุด<select id="set">${SETS.map((n) => `<option value="${n}">${n}${n === r.set ? " ✓" : ""}</option>`).join("")}</select></label>
          <label>หน้า<select id="page">${Array.from({ length: Math.max(exam.pages || 1, r.page || 1) }, (_, i) => i + 1).map((n) => `<option value="${n}">${n}${n === r.page ? " ✓" : ""}</option>`).join("")}</select></label>
          <div class="stat inline"><b id="score">–</b><span>คะแนนแผ่นนี้</span></div>
        </div>
        <div class="card">
          <div class="legend">
            <span><i class="sw ok"></i>อ่านได้</span><span><i class="sw low"></i>ไม่มั่นใจ</span>
            <span><i class="sw crossed"></i>ขีดฆ่า</span><span><i class="sw edited"></i>ครูแก้แล้ว</span>
          </div>
          <div id="grid" class="grid" tabindex="0" aria-label="ตารางคำตอบ 20×20"></div>
          <p class="muted small hide-touch">คลิกช่องแล้วพิมพ์ <kbd>A</kbd>–<kbd>Z</kbd> เพื่อแก้ · <kbd>Del</kbd> ว่าง · <kbd>-</kbd> ขีดฆ่า · ลูกศรเลื่อน</p>
          <div id="cell-panel" class="cell-panel"></div>
        </div>
      </section>
    </div>
    <section class="card">
      <h3>ผลรายข้อ</h3>
      <table class="table compact"><thead><tr><th>ข้อ</th><th>อ่านได้</th><th>เฉลย</th><th>คะแนน</th><th>ผล</th><th class="hide-sm">หมายเหตุ</th></tr></thead><tbody id="rows"></tbody></table>
      ${q ? `<p class="muted small">คุณภาพภาพ: พบสี่เหลี่ยมดำ ${q.markers_found}/3${q.used_fallback ? " (ใช้วิธีสำรอง — ควรตรวจภาพ)" : ""} · ${r.ms ? Math.round(r.ms) + " ms" : ""}</p>` : ""}
    </section>`;

  const save = () => Store.put("sheets", sheet);
  $("#set").value = Grade.setOf(sheet);
  $("#page").value = Grade.pageOf(sheet);
  $("#set").onchange = async (e) => { sheet.setOverride = Number(e.target.value); await save(); refresh(); };
  $("#page").onchange = async (e) => { sheet.pageOverride = Number(e.target.value); await save(); refresh(); };
  $("#sid").onchange = async (e) => { sheet.studentId = e.target.value.trim(); await save(); toast("บันทึกแล้ว"); };

  // ----- ภาพ -----
  const cv = $("#cv");
  const work = document.createElement("canvas");
  function drawStage() {
    $$(".seg button").forEach((b) => b.classList.toggle("active", b.dataset.stage === stage));
    if (!img) { $("#stage-note").textContent = "ไม่มีภาพ"; return; }
    if (stage === "before") { drawImage(cv, img); $("#stage-note").textContent = `${img.naturalWidth}×${img.naturalHeight}px`; return; }
    if (dewarped) drawImage(work, dewarped); else drawGray(work, img);
    if (stage === "after") {
      if (dewarped) drawImage(cv, dewarped); else drawGray(cv, img);
      $("#stage-note").textContent = dewarped ? "หมุนตั้งตรง + ดัดระนาบด้วยสี่เหลี่ยมดำ 3 มุม" : "โหมดจำลอง: แสดงแค่ภาพขาวดำ";
      return;
    }
    drawCellsOverlay(cv, work, r, sel);
    $("#stage-note").textContent = "กรอบเขียว = มีตัวอักษร · แดง = ขีดฆ่า · ส้ม = ช่องที่เลือก";
  }
  $$(".seg button").forEach((b) => (b.onclick = () => { stage = b.dataset.stage; drawStage(); }));

  // ----- ตาราง -----
  const rules = Settings.get();
  const grid = $("#grid");
  const cls = (cell) => cell.edited ? "edited" : cell.cls === "empty" ? "empty" : cell.cls === "crossed" ? "crossed" : cell.conf < rules.lowConf ? "low" : "ok";
  function renderGrid() {
    grid.innerHTML = r.reads.map((row, ri) =>
      `<div class="rh">${(Grade.pageOf(sheet) - 1) * ROWS + ri + 1}</div>` + row.map((cell, ci) =>
        `<div class="cell ${cls(cell)} ${sel.r === ri && sel.c === ci ? "sel" : ""}" data-r="${ri}" data-c="${ci}">${esc(cell.lower ? cell.char.toLowerCase() : cell.char)}</div>`
      ).join("")
    ).join("");
  }
  function renderPanel() {
    const cell = r.reads[sel.r][sel.c];
    const p = $("#cell-panel");
    const o = cell.orig;
    const opts = [...new Set([...(cell.top3 || []).map((t) => t[0]), o?.char].filter((x) => x && /^[A-Z]$/.test(x)))];
    p.innerHTML = `<div class="cp-crop"></div><div class="cp-info">
      <b>ข้อ ${(Grade.pageOf(sheet) - 1) * ROWS + sel.r + 1} ช่อง ${sel.c + 1}</b>
      <div class="muted small">${o ? `ระบบอ่าน “${esc(o.char)}” → ครูแก้เป็น ${cell.cls === "empty" ? "ช่องว่าง" : cell.cls === "crossed" ? "ขีดฆ่า" : "“" + esc(cell.char) + "”"}`
        : cell.cls === "empty" ? "ช่องว่าง" : `ระบบอ่าน “${esc(cell.char)}”${cell.cls === "crossed" ? " (ขีดฆ่า)" : ""} · มั่นใจ ${Math.round(cell.conf * 100)}%`}</div>
      <div class="row tight">
        ${opts.map((x) => `<button class="opt" data-v="${x}">${x}</button>`).join("")}
        <button class="ghost small" data-v="empty">ว่าง</button><button class="ghost small" data-v="crossed">ขีดฆ่า</button>
        ${o ? `<button id="undo" class="ghost small">คืนค่าเดิม</button>` : ""}
      </div></div>`;
    $(".cp-crop", p).appendChild(cellCrop(sheet, dewarped || img, sel.r, sel.c, 76));
    $$("[data-v]", p).forEach((b) => (b.onclick = async () => { setCell(cell, b.dataset.v); await save(); refresh(); }));
    const u = $("#undo");
    if (u) u.onclick = async () => { Object.assign(cell, cell.orig); delete cell.orig; delete cell.edited; await save(); refresh(); };
  }
  function renderScore() {
    const g = Grade.sheet(sheet, exam, Settings.get());
    $("#score").textContent = g.max ? `${fmt(g.score)}/${g.max}` : "–";
    $("#rows").innerHTML = g.rows.map((x, i) => `
      <tr class="${i === sel.r ? "cur" : ""}" data-row="${i}">
        <td>${x.q}</td><td class="mono">${esc(x.word) || "—"}</td><td class="mono">${esc(x.key) || "—"}</td>
        <td class="mono">${x.max ? fmt(x.points) : "–"}</td>
        <td><span class="st ${x.status}">${STATUS_TH[x.status]}</span></td><td class="muted small hide-sm">${esc(x.note)}</td>
      </tr>`).join("");
    $$("#rows tr").forEach((tr) => (tr.onclick = () => { sel = { r: +tr.dataset.row, c: 0 }; refresh(); grid.scrollIntoView({ block: "nearest" }); }));
  }
  function refresh() { renderGrid(); renderPanel(); renderScore(); if (stage === "cells") drawStage(); }

  grid.addEventListener("click", (e) => {
    const el = e.target.closest(".cell");
    if (!el) return;
    sel = { r: +el.dataset.r, c: +el.dataset.c };
    grid.focus({ preventScroll: true });
    refresh();
  });
  grid.addEventListener("keydown", async (e) => {
    const k = e.key;
    const move = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
    if (move) {
      e.preventDefault();
      sel = { r: Math.max(0, Math.min(ROWS - 1, sel.r + move[0])), c: Math.max(0, Math.min(COLS - 1, sel.c + move[1])) };
      return refresh();
    }
    let v = null;
    if (/^[a-zA-Z]$/.test(k)) v = k.toUpperCase();
    else if (k === "Delete" || k === "Backspace" || k === " ") v = "empty";
    else if (k === "-" || k === "=") v = "crossed";
    if (!v || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    setCell(r.reads[sel.r][sel.c], v);
    if (/^[A-Z]$/.test(v) && sel.c < COLS - 1) sel = { r: sel.r, c: sel.c + 1 };
    await save();
    refresh();
  });

  outer: for (let ri = 0; ri < ROWS; ri++)
    for (let ci = 0; ci < COLS; ci++) {
      const cell = r.reads[ri][ci];
      if (cell.cls === "char" && cell.conf < rules.lowConf && !cell.edited) { sel = { r: ri, c: ci }; break outer; }
    }
  drawStage();
  refresh();
};
