// ที่เก็บข้อมูลในเบราว์เซอร์
// - ห้องเรียน (รายชื่อนักเรียน), การสอบ, กระดาษคำตอบ (รวมภาพ) → IndexedDB
// - ตั้งค่า → localStorage
// ถ้าเบราว์เซอร์ไม่ให้ใช้ (private mode ฯลฯ) จะเก็บในหน่วยความจำแทน (หายเมื่อปิดหน้า)

const Store = (() => {
  const NAMES = ["classes", "exams", "sheets"];
  const mem = Object.fromEntries(NAMES.map((n) => [n, new Map()]));
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve) => {
      try {
        const rq = indexedDB.open("examer", 2);
        rq.onupgradeneeded = () => {
          const db = rq.result;
          if (!db.objectStoreNames.contains("exams")) db.createObjectStore("exams", { keyPath: "id" });
          if (!db.objectStoreNames.contains("sheets")) db.createObjectStore("sheets", { keyPath: "id" }).createIndex("examId", "examId");
          if (!db.objectStoreNames.contains("classes")) db.createObjectStore("classes", { keyPath: "id" });
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
      if (s) await req(s.put(obj));
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
      if (s) await req(s.delete(id));
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
      for (const c of await this.all("classes")) await this.del("classes", c.id);
    },
  };
})();

const Settings = (() => {
  const KEY = "examer.settings";
  const defaults = {
    engine: "browser",   // browser = โมเดลจริงในเบราว์เซอร์ · mock = โหมดจำลอง
    lowConf: 0.6,        // ต่ำกว่านี้ → ส่งครูตรวจทาน
    lowercase: "upper",  // upper = นับเป็นพิมพ์ใหญ่ · wrong = ผิด
    gap: "join",         // join = ต่อกัน · wrong = ผิด   (เว้นช่องกลางคำ)
    start: "accept",     // accept = ยอมรับ · wrong = ผิด (ไม่เริ่มช่องแรก)
    partial: "word",     // word = ถูกทั้งคำเท่านั้น · letters = ตามสัดส่วนตัวอักษรถูก
    teacher: "",
    school: "",
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
