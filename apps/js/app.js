// router — เปลี่ยนหน้าตาม #hash (ใช้ได้แม้เปิดไฟล์ตรงๆ แบบ file://)

const routes = [
  [/^#\/$/, Views.home],
  [/^#\/classes$/, Views.classes],
  [/^#\/class\/(\w+)$/, Views.classEdit],
  [/^#\/exam\/new$/, Views.examNew],
  [/^#\/exam\/(\w+)(?:\/(setup|scan|review|scores))?$/, Views.exam],
  [/^#\/sheet\/(\w+)$/, Views.sheet],
  [/^#\/settings$/, Views.settings],
];

async function router() {
  const hash = location.hash || "#/";
  const root = $("#view");
  Page.leave();
  $$(".nav a").forEach((a) => {
    const prefixes = (a.dataset.match || "").split(" ").filter(Boolean);
    a.classList.toggle("active", hash === a.getAttribute("href") || prefixes.some((m) => hash.startsWith(m)));
  });
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
  if (!Pipeline.isLive()) { b.textContent = "โหมดจำลอง"; b.title = "ผลอ่านเป็นข้อมูลจำลอง — เปลี่ยนได้ในตั้งค่า"; return; }
  if (st.status === "ready") { b.textContent = "● โมเดลพร้อม"; b.classList.add("live"); }
  else if (st.status === "loading") { b.textContent = `กำลังโหลดโมเดล ${Math.round(st.p * 100)}%`; b.classList.add("loading"); }
  else if (st.status === "error") { b.textContent = "โหลดโมเดลไม่สำเร็จ"; b.classList.add("bad"); }
  else { b.textContent = "โมเดลในเบราว์เซอร์"; }
  b.title = st.error || st.text;
}

window.addEventListener("hashchange", router);
BrowserEngine.onChange(updateBadge);
updateBadge();
router();
