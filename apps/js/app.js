const $ = (s) => document.querySelector(s);
// ROWS, COLS มาจาก pipeline.js

let file = null;
let image = null;   // HTMLImageElement ของภาพที่อัปโหลด
let result = null;  // ผลจาก Pipeline.run

// ---------- เฉลย ----------
const keyBox = $("#key");
for (let i = 1; i <= ROWS; i++) {
  keyBox.insertAdjacentHTML(
    "beforeend",
    `<label><b>${i}</b><input data-q="${i}" maxlength="${COLS}" autocomplete="off" spellcheck="false" /></label>`
  );
}
const keyInputs = [...keyBox.querySelectorAll("input")];
keyInputs.forEach((el) =>
  el.addEventListener("input", () => {
    el.value = el.value.toUpperCase().replace(/[^A-Z]/g, "");
    if (result) renderScore();
  })
);
const getKey = () => keyInputs.map((el) => el.value.trim());

$("#key-demo").onclick = () => {
  const demo = ["CAT", "VISION", "MODEL", "PIXEL", "TEACHER", "SCHOOL", "ANSWER", "GRADE", "LETTER", "PAPER",
    "NEURAL", "CAMERA", "TABLE", "MOBILE", "SCORE", "EXAM", "WRITE", "READ", "SHEET", "THAILAND"];
  keyInputs.forEach((el, i) => (el.value = demo[i]));
  if (result) renderScore();
};
$("#key-clear").onclick = () => {
  keyInputs.forEach((el) => (el.value = ""));
  if (result) renderScore();
};

// ---------- อัปโหลด ----------
const drop = $("#drop");
$("#file").addEventListener("change", (e) => loadFile(e.target.files[0]));
["dragenter", "dragover"].forEach((t) =>
  drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); })
);
["dragleave", "drop"].forEach((t) =>
  drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); })
);
drop.addEventListener("drop", (e) => loadFile(e.dataTransfer.files[0]));

function loadFile(f) {
  if (!f || !f.type.startsWith("image/")) return setStatus("กรุณาเลือกไฟล์ภาพ");
  file = f;
  const img = new Image();
  img.onload = () => {
    image = img;
    $("#file-name").textContent = `${f.name} · ${img.naturalWidth}×${img.naturalHeight}px`;
    $("#run").disabled = false;
    drawBefore();
    setStatus("");
  };
  img.src = URL.createObjectURL(f);
}

// ---------- รัน ----------
$("#run").onclick = async () => {
  $("#run").disabled = true;
  setStatus("กำลังตรวจ…");
  try {
    result = await Pipeline.run(file, getKey());
    await drawAfter();
    await drawCells();
    renderGrid();
    renderScore();
    setStatus(
      Pipeline.isLive() ? "ตรวจเสร็จ" : "ตรวจเสร็จ (ผลจำลอง — ยังไม่ได้ต่อโมเดล)"
    );
  } catch (err) {
    setStatus("ผิดพลาด: " + err.message);
  } finally {
    $("#run").disabled = false;
  }
};

function setStatus(t) { $("#status").textContent = t; }

// ---------- แท็บ ----------
document.querySelectorAll(".tab").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".tabpane").forEach((p) =>
      p.classList.toggle("active", p.id === "tab-" + btn.dataset.tab)
    );
  })
);

// ---------- วาดภาพ ----------
const MAX_W = 900;
function fit(canvas, w, h) {
  const s = Math.min(1, MAX_W / w);
  canvas.width = Math.round(w * s);
  canvas.height = Math.round(h * s);
  return canvas.getContext("2d");
}

function drawBefore() {
  const c = $("#cv-before");
  fit(c, image.naturalWidth, image.naturalHeight).drawImage(image, 0, 0, c.width, c.height);
}

// วาดภาพจาก data URL ลง canvas (ใช้กับภาพที่โมเดลส่งกลับมา)
function drawDataUrl(canvas, url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      fit(canvas, img.naturalWidth, img.naturalHeight).drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve();
    };
    img.onerror = resolve;
    img.src = url;
  });
}

// ต่อโมเดลแล้ว: "After" = ภาพที่โมเดลดัดระนาบแล้วจริง
// โหมดจำลอง: "After" = grayscale + เพิ่ม contrast (ยังไม่ได้ตัดขอบจริง)
async function drawAfter() {
  const c = $("#cv-after");
  if (result.images?.rectified) {
    await drawDataUrl(c, result.images.rectified);
    const t = result.timing_ms || {};
    $("#dewarp-meta").textContent =
      `มุมกระดาษบนภาพต้นฉบับ: ${JSON.stringify(result.dewarp.corners)} · ${t.dewarp ?? "?"} ms`;
    return;
  }
  const ctx = fit(c, image.naturalWidth, image.naturalHeight);
  ctx.drawImage(image, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    const v = Math.max(0, Math.min(255, (g - 128) * 1.4 + 128));
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
  }
  ctx.putImageData(d, 0, 0);
  $("#dewarp-meta").textContent = Pipeline.isLive()
    ? `มุมกระดาษ: ${JSON.stringify(result.dewarp.corners)}`
    : "โหมดจำลอง: แสดงแค่ grayscale — รอโมเดลส่วนที่ 1 (หา 3 สี่เหลี่ยมดำ → homography)";
}

async function drawCells() {
  const src = $("#cv-after");
  const c = $("#cv-cells");
  if (result.images?.overlay) {
    await drawDataUrl(c, result.images.overlay);
    $("#cells-meta").textContent =
      `${ROWS}×${COLS} = ${ROWS * COLS} ช่อง · ภาพ overlay จากโมเดล · ${result.timing_ms?.total ?? "?"} ms ทั้งแผ่น`;
    return;
  }
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(src, 0, 0);
  const b = result.cells.box;
  const x0 = b.x * c.width, y0 = b.y * c.height, w = b.w * c.width, h = b.h * c.height;
  ctx.strokeStyle = "rgba(31,140,100,.9)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= ROWS; i++) line(ctx, x0, y0 + (h * i) / ROWS, x0 + w, y0 + (h * i) / ROWS);
  for (let j = 0; j <= COLS; j++) line(ctx, x0 + (w * j) / COLS, y0, x0 + (w * j) / COLS, y0 + h);
  $("#cells-meta").textContent = `${ROWS}×${COLS} = ${ROWS * COLS} ช่อง` +
    (Pipeline.isLive() ? "" : " · โหมดจำลอง: กรอบตารางเป็นค่าประมาณคงที่");
}
function line(ctx, a, b, c, d) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }

// ---------- ตาราง 20×20 ----------
function cellClass(cell) {
  if (cell.cls === "empty") return "empty";
  if (cell.cls === "crossed") return "crossed";
  return cell.conf < Pipeline.LOW_CONF ? "low" : "ok";
}

function renderGrid() {
  const g = $("#grid");
  g.innerHTML = "";
  result.reads.forEach((row, r) => {
    g.insertAdjacentHTML("beforeend", `<div class="rh">${r + 1}</div>`);
    row.forEach((cell, c) => {
      const el = document.createElement("div");
      el.className = `cell ${cellClass(cell)}${cell.edited ? " edited" : ""}`;
      el.textContent = cell.char;
      el.title = `ข้อ ${r + 1} ช่อง ${c + 1} · ${cell.cls} · conf ${cell.conf.toFixed(2)}`;
      el.onclick = () => editCell(r, c);
      g.appendChild(el);
    });
  });
}

function editCell(r, c) {
  const cell = result.reads[r][c];
  const v = prompt(`ข้อ ${r + 1} ช่อง ${c + 1}\nพิมพ์ตัวอักษร A–Z · เว้นว่าง = ช่องว่าง · "-" = ขีดฆ่า`, cell.char);
  if (v === null) return;
  const t = v.trim().toUpperCase();
  if (t === "-") Object.assign(cell, { cls: "crossed", conf: 1 });
  else if (t === "") Object.assign(cell, { char: "", cls: "empty", conf: 1 });
  else if (/^[A-Z]$/.test(t)) Object.assign(cell, { char: t, cls: "char", conf: 1 });
  else return alert("ใส่ได้ทีละ 1 ตัว A–Z");
  cell.edited = true;
  renderGrid();
  renderScore();
}

// ---------- คะแนน ----------
function renderScore() {
  const key = getKey();
  const rows = result.reads.map((row, i) => ({ q: i + 1, key: key[i], ...Pipeline.gradeRow(row, key[i]) }));
  const counted = rows.filter((r) => r.key);
  const right = counted.filter((r) => r.status === "right").length;
  const review = result.reads.flat().filter((c) => c.cls === "char" && c.conf < Pipeline.LOW_CONF).length;

  $("#s-score").textContent = counted.length ? `${right}/${counted.length}` : "–";
  $("#s-review").textContent = review;
  $("#s-student").textContent = result.student_id || "–";

  const label = { right: "ถูก", wrong: "ผิด", review: "รอครูตรวจ", nokey: "ไม่มีเฉลย" };
  $("#result-body").innerHTML = rows.map((r) => `
    <tr>
      <td>${r.q}</td>
      <td class="mono">${r.read || "—"}</td>
      <td class="mono">${r.key || "—"}</td>
      <td class="${r.status}">${label[r.status]}</td>
    </tr>`).join("");

  lastRows = rows;
  $("#dl-json").disabled = $("#dl-csv").disabled = false;
}

// ---------- export ----------
let lastRows = [];
$("#dl-json").onclick = () =>
  download("examer_result.json", JSON.stringify({ student_id: result.student_id, answers: lastRows, cells: result.reads }, null, 2), "application/json");
$("#dl-csv").onclick = () => {
  const lines = ["student_id,question,read,key,status"];
  lastRows.forEach((r) => lines.push([result.student_id, r.q, r.read, r.key || "", r.status].join(",")));
  download("examer_result.csv", "﻿" + lines.join("\n"), "text/csv");
};
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- badge ----------
if (Pipeline.isLive()) {
  $("#mode-badge").textContent = "ต่อโมเดลแล้ว";
  $("#mode-badge").classList.add("live");
}
