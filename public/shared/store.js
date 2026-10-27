// ที่เก็บข้อมูลในเบราว์เซอร์
// - ห้องเรียน (รายชื่อนักเรียน), รายวิชา, ครู, การสอบ, กระดาษคำตอบ (รวมภาพ), ผลที่ครูส่งมา → IndexedDB
// - ตั้งค่า → localStorage
// ถ้าเบราว์เซอร์ไม่ให้ใช้ (private mode ฯลฯ) จะเก็บในหน่วยความจำแทน (หายเมื่อปิดหน้า)

const Store = (() => {
  const NAMES = ["classes", "subjects", "teachers", "exams", "sheets", "submissions"];
  const mem = Object.fromEntries(NAMES.map((n) => [n, new Map()]));
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve) => {
      try {
        const rq = indexedDB.open("examer", 3);
        rq.onupgradeneeded = () => {
          const db = rq.result;
          if (!db.objectStoreNames.contains("sheets")) db.createObjectStore("sheets", { keyPath: "id" }).createIndex("examId", "examId");
          for (const n of NAMES) if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: "id" });
        };
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return dbp;
  }

  const req = (rq) =>
    new Promise((res, rej) => {
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });

  // เขียน/ลบ: รอให้ transaction "complete" (ลงดิสก์แล้ว) ไม่ใช่แค่คำสั่งสำเร็จ
  // ไม่งั้นปิด/รีโหลดหน้าทันทีหลังบันทึก ข้อมูลที่ยังไม่ commit หายได้ (ทดสอบ: เขียน 378 แผ่นแล้วรีโหลด เหลือ 152)
  const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = tx.onabort = () => rej(tx.error); });

  async function os(name, mode) {
    const db = await open();
    return db ? db.transaction(name, mode).objectStore(name) : null;
  }

  return {
    async persistent() {
      return Boolean(await open());
    },
    async put(name, obj) {
      const s = await os(name, "readwrite");
      if (s) { s.put(obj); await done(s.transaction); }
      else mem[name].set(obj.id, obj);
      return obj;
    },
    async get(name, id) {
      const s = await os(name, "readonly");
      return s ? req(s.get(id)) : mem[name].get(id);
    },
    async all(name) {
      const s = await os(name, "readonly");
      return s ? req(s.getAll()) : [...mem[name].values()];
    },
    async del(name, id) {
      const s = await os(name, "readwrite");
      if (s) { s.delete(id); await done(s.transaction); }
      else mem[name].delete(id);
    },
    async sheetsOf(examId) {
      const s = await os("sheets", "readonly");
      const list = s
        ? await req(s.index("examId").getAll(examId))
        : [...mem.sheets.values()].filter((x) => x.examId === examId);
      return list.sort((a, b) => a.createdAt - b.createdAt);
    },
    async deleteExam(id) {
      for (const sh of await this.sheetsOf(id)) await this.del("sheets", sh.id);
      await this.del("exams", id);
    },
    async clear() {
      for (const ex of await this.all("exams")) await this.deleteExam(ex.id);
      for (const n of ["classes", "subjects", "teachers", "submissions"]) for (const x of await this.all(n)) await this.del(n, x.id);
    },
  };
})();

const Settings = (() => {
  const KEY = "examer.settings";
  const defaults = {
    engine: "mock",      // ยังไม่ได้ต่อโมเดลจริง → โหมดจำลองเท่านั้น [claude/gelatin · 2026-10-28]
    lowConf: 0.6,        // ต่ำกว่านี้ → ส่งครูตรวจทาน
    lowercase: "upper",  // upper = นับเป็นพิมพ์ใหญ่ · wrong = ผิด
    gap: "join",         // join = ต่อกัน · wrong = ผิด   (เว้นช่องกลางคำ)
    start: "accept",     // accept = ยอมรับ · wrong = ผิด (ไม่เริ่มช่องแรก)
    partial: "word",     // word = ถูกทั้งคำเท่านั้น · letters = ตามสัดส่วนตัวอักษรถูก
    role: "",            // "" = ยังไม่ได้เลือก · teacher = ครูผู้สอน · admin = ฝ่ายวิชาการ
    teacherName: "",
    schoolName: "",
    year: String(new Date().getFullYear() + 543 - (new Date().getMonth() < 4 ? 1 : 0)), // ปีการศึกษา (เริ่ม พ.ค.)
    term: new Date().getMonth() >= 4 && new Date().getMonth() <= 9 ? "1" : "2",
  };
  let memo = null;
  return {
    defaults,
    get() {
      let saved = memo;
      try {
        saved = JSON.parse(localStorage.getItem(KEY)) || saved;
      } catch {}
      return { ...defaults, ...(saved || {}) };
    },
    set(patch) {
      memo = { ...this.get(), ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(memo));
      } catch {}
      return memo;
    },
  };
})();
