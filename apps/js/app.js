// router — เปลี่ยนหน้าตาม #hash (ใช้ได้แม้เปิดไฟล์ตรงๆ แบบ file://)

const routes = [
  [/^#\/$/, Views.home],
  // ครู
  [/^#\/exam\/new$/, Views.examNew],
  [/^#\/exam\/(\w+)(?:\/(photo|check|score|edit|setup|scan|review|scores))?$/, Views.exam],
  [/^#\/sheet\/(\w+)$/, Views.sheet],
  // ฝ่ายวิชาการ
  [/^#\/classes$/, Views.classes],
  [/^#\/class\/(\w+)$/, Views.classEdit],
  [/^#\/subjects$/, Views.subjects],
  [/^#\/central$/, Views.central],
  [/^#\/central\/new$/, Views.centralNew],
  [/^#\/result\/(\w+)$/, Views.result],
  [/^#\/settings$/, Views.settings],
];

const NAV = {
  teacher: [["#/", "การสอบของฉัน", "#/exam #/sheet"], ["#/settings", "ตั้งค่า", ""]],
  admin: [["#/", "ภาพรวม", "#/result"], ["#/classes", "ห้องเรียน", "#/class"], ["#/subjects", "รายวิชาและครู", ""], ["#/central", "ข้อสอบกลาง", "#/exam"], ["#/settings", "ตั้งค่า", ""]],
};

function renderNav() {
  const s = Settings.get();
  const items = NAV[s.role] || [];
  $(".nav").innerHTML = items.map(([href, label, match]) => `<a href="${href}" data-match="${match}">${label}</a>`).join("");
  $(".brand small").textContent = s.schoolName || "ตรวจข้อสอบข้อเขียน";
  $("#mode-badge").hidden = !s.role;
  document.body.dataset.role = s.role || "none";
  markNav();
}

function markNav() {
  const hash = location.hash || "#/";
  $$(".nav a").forEach((a) => {
    const prefixes = (a.dataset.match || "").split(" ").filter(Boolean);
    a.classList.toggle("active", hash === a.getAttribute("href") || prefixes.some((m) => hash.startsWith(m)));
  });
}

async function router() {
  const hash = location.hash || "#/";
  const root = $("#view");
  Page.leave();
  markNav();
  for (const [re, view] of routes) {
    const m = hash.match(re);
    if (!m) continue;
    try {
      await view(root, ...m.slice(1).filter((x) => x !== undefined));
    } catch (err) {
      console.error(err);
      root.innerHTML = `<div class="empty-state"><h3>เกิดข้อผิดพลาด</h3><p class="muted">${esc(err.message)}</p><a href="#/">กลับหน้าแรก</a></div>`;
    }
    window.scrollTo(0, 0);
    return;
  }
  location.hash = "#/";
}

function updateBadge() {
  const b = $("#mode-badge");
  const st = BrowserEngine.state();
  b.classList.remove("live", "loading", "bad");
  const q = ScanQueue.state();
  if (!Pipeline.isLive()) {
    b.textContent = q.pending ? `โหมดทดลอง · เหลือ ${q.pending} แผ่น` : "โหมดทดลอง";
    b.title = "ผลอ่านเป็นข้อมูลสุ่ม — เปลี่ยนได้ในตั้งค่า";
    return;
  }
  if (st.status === "ready") { b.textContent = "ระบบตรวจพร้อม"; b.classList.add("live"); }
  else if (st.status === "loading") { b.textContent = `กำลังเตรียมระบบตรวจ ${Math.round(st.p * 100)}%`; b.classList.add("loading"); }
  else if (st.status === "error") { b.textContent = "ระบบตรวจมีปัญหา"; b.classList.add("bad"); }
  else { b.textContent = "ระบบตรวจยังไม่เริ่ม"; }
  b.title = st.error || st.text;
  if (q.pending && st.status !== "loading") { b.textContent = `กำลังตรวจ · เหลือ ${q.pending} แผ่น`; b.classList.add("loading"); }
}

window.addEventListener("hashchange", router);
renderNav();
BrowserEngine.onChange(updateBadge);
ScanQueue.onChange(updateBadge);
updateBadge();
router();
ScanQueue.kick(); // ตรวจต่อแผ่นที่ค้างจากครั้งก่อน
