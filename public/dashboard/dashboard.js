// dashboard/dashboard.js — เว็บฝ่ายวิชาการ (back office) · sidebar: Dashboard · Application · ล่างสุด = เข้าสู่ระบบ
// Application = แอปครู (../app/) เปิดในกรอบมือถือ (iframe เว็บเดียวกัน → ข้อมูลในเครื่องใช้ร่วมกัน)

const Dashboard = (() => {
  const NAV = [
    ["#/", "Dashboard", "grid"],
    ["#/app", "Application", "phone"],
  ];
  // หน้าย่อยของ Dashboard (แถบ header ด้านบน) — ยังไม่มีข้อมูล ทำไว้แค่โครง
  const PAGES = [
    ["#/", "ภาพรวม", "ผลการสอบของทั้งโรงเรียนจะแสดงที่นี่ เมื่อครูเริ่มตรวจข้อสอบในแอป"],
    ["#/classes", "ห้องเรียน", "ห้องเรียนและรายชื่อนักเรียนจะแสดงที่นี่"],
    ["#/subjects", "รายวิชาและครู", "รายวิชาและครูผู้สอนแต่ละวิชาจะแสดงที่นี่"],
    ["#/central", "ข้อสอบกลาง", "ข้อสอบที่ฝ่ายวิชาการตั้งเฉลยให้ครูทุกห้องใช้ร่วมกันจะแสดงที่นี่"],
  ];
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
    const inDash = PAGES.some(([h]) => h === hash);
    $$(".side-nav a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === (inDash ? "#/" : hash)));
  }

  function routes() {
    // ---------- หน้า Dashboard: header + หน้าย่อย ----------
    for (const [href, label, hint] of PAGES) {
      Router.add(new RegExp("^" + href.replace(/[/#]/g, "\\$&") + "$"), () => {
        mark();
        $("#main").innerHTML = `
          <header class="dash-top">
            <h1>Dashboard</h1>
            <nav class="dash-tabs">${PAGES.map(([h, l]) => `<a href="${h}" class="${h === href ? "active" : ""}" ${h === href ? 'aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
          </header>
          <section class="dash-page">
            <h2>${label}</h2>
            <div class="blank">
              <div class="blank-grid" aria-hidden="true">${"<i></i>".repeat(12)}</div>
              <h3>ยังไม่มีข้อมูล</h3>
              <p class="muted">${hint}</p>
            </div>
          </section>`;
        const tabs = $(".dash-tabs"), on = $(".dash-tabs .active"); // จอแคบ: แถบเลื่อนข้าง → ให้เห็นแท็บที่เลือก
        if (tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = on.offsetLeft - tabs.offsetLeft - (tabs.clientWidth - on.offsetWidth) / 2;
      });
    }

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
