// shared/core.js — ของที่ Dashboard (dashboard/) และแอปครู (app/) ใช้ร่วมกัน:
// ตัวช่วย · ไอคอน · โลโก้ · การเข้าสู่ระบบ (ต้นแบบ) · router
// แต่ละหน้าบอกชื่อที่เก็บการเข้าสู่ระบบผ่าน <html data-session="..."> แล้วเรียก App.start(Dashboard | Mobile)

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ICONS = {
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.9-3.9 3.6-6 7-6s6.1 2.1 7 6"/>',
  logout: '<path d="M14 4.5h4.5v15H14"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
  pencil: '<path d="M4.5 19.5l1-4.2L15.8 5a2 2 0 012.8 0l.4.4a2 2 0 010 2.8L8.7 18.5z"/><path d="M13.5 7.3l3.2 3.2"/>',
  check: '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 12.2l2.6 2.6L16 9.4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M5 19.5h14"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
};
const ico = (name, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// โลโก้ (ไอคอนแอป): ช่องคำตอบ 1 ช่องที่มีตัว E เขียนด้วยมือ + เครื่องหมายถูกสีแดงของครู
// วาดเป็นเส้นทั้งหมด (ไม่พึ่งฟอนต์) → ย่อเล็กเป็นไอคอนแอป/favicon ได้ชัด
const LOGO_SVG = (bg = "var(--accent)", fg = "var(--accent-ink)", red = "var(--red-mark)") => `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
  <rect width="64" height="64" rx="15" fill="${bg}"/>
  <rect x="13" y="12" width="30" height="36" rx="3.5" fill="none" stroke="${fg}" stroke-width="3" opacity=".92"/>
  <path d="M35.5 19.5c-4.2-.4-8 0-10.8.3-.3 5.7-.2 11.6.1 17.6 3.6.3 7.4.2 11.2-.2M24.9 28.4c3.2-.2 6.2-.1 8.9.1" fill="none" stroke="${fg}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M34 45.5l6.2 6.5L54 33.5" fill="none" stroke="${red}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
const LOGO = LOGO_SVG();
const brand = (sub = "", cls = "") => `<span class="brand ${cls}">${LOGO}<span><b>Examer</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></span>`;

// favicon = โลโก้เดียวกัน (สีจริง เพราะ favicon ไม่รู้จักตัวแปร CSS)
(() => {
  const l = document.createElement("link");
  l.rel = "icon";
  l.href = "data:image/svg+xml," + encodeURIComponent(LOGO_SVG("#1b4b5f", "#ffffff", "#ff5a4a").replace('class="logo" ', 'xmlns="http://www.w3.org/2000/svg" '));
  document.head.append(l);
})();

// เก็บค่าใน localStorage (อ่าน/เขียนพังได้ในบางโหมดของเบราว์เซอร์ → ใช้ค่าเริ่มต้นแทน)
const Local = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
  del(key) { try { localStorage.removeItem(key); } catch {} },
};

// การเข้าสู่ระบบ — ต้นแบบ: ยังไม่มีระบบบัญชีจริง กรอกชื่ออะไรก็เข้าได้
// Dashboard กับแอปครูเข้าสู่ระบบแยกกัน (examer.session.dashboard / examer.session.app)
const Session = (() => {
  const KEY = "examer.session." + (document.documentElement.dataset.session || "app");
  return {
    user: () => Local.get(KEY, null),
    login: (name) => Local.set(KEY, { name, at: Date.now() }),
    logout: () => Local.del(KEY),
  };
})();

// ฟอร์มเข้าสู่ระบบ (ใช้ทั้ง Dashboard และแอป)
function loginForm({ title, hint, onDone }) {
  const el = document.createElement("form");
  el.className = "login-form";
  el.innerHTML = `
    ${title ? `<h2>${esc(title)}</h2>` : ""}
    ${hint ? `<p class="muted">${esc(hint)}</p>` : ""}
    <label>ชื่อผู้ใช้<input name="user" autocomplete="username" required /></label>
    <label>รหัสผ่าน<input name="pass" type="password" autocomplete="current-password" required /></label>
    <p class="err" hidden></p>
    <button class="btn primary block" type="submit">เข้าสู่ระบบ</button>
    <p class="proto-note">ต้นแบบ: ยังไม่มีระบบบัญชีจริง กรอกชื่อและรหัสอะไรก็ได้</p>`;
  el.onsubmit = (e) => {
    e.preventDefault();
    const name = el.user.value.trim();
    if (!name || !el.pass.value) { const p = $(".err", el); p.hidden = false; p.textContent = "กรอกชื่อผู้ใช้และรหัสผ่าน"; return; }
    Session.login(name);
    onDone();
  };
  return el;
}

// router ตาม #hash · แต่ละหน้าคืนฟังก์ชันเก็บกวาดได้ (ถ้ามี) ตอนออกจากหน้า
const Router = {
  routes: [],
  cleanup: null,
  add(re, view) { this.routes.push([re, view]); },
  async go() {
    const hash = location.hash || "#/";
    if (this.cleanup) { try { this.cleanup(); } catch {} this.cleanup = null; }
    for (const [re, view] of this.routes) {
      const m = hash.match(re);
      if (!m) continue;
      try { this.cleanup = (await view(...m.slice(1))) || null; }
      catch (err) { console.error(err); toast("เกิดข้อผิดพลาด: " + err.message); }
      return;
    }
    location.hash = "#/";
  },
};

const App = {
  start(page) {
    page.start();
    addEventListener("hashchange", () => Router.go());
    Router.go();
  },
};
