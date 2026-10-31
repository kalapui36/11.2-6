// 데이터 저장소. 학생 화면과 교사 화면이 함께 사용한다.
// 지금(1단계)은 브라우저 localStorage에 저장하는 임시 저장소다.
// 같은 브라우저의 여러 탭끼리는 실시간으로 반영되므로 탭 여러 개로 시험해 볼 수 있다.
// 2단계에서 같은 사용법(subscribe, claim, release)을 지키는 Firebase 저장소로 바꾼다.

function makeStudentId(group, num) {
  return `${group}-${num}`;
}

function parseStudentId(studentId) {
  const i = studentId.lastIndexOf('-');
  return { group: studentId.slice(0, i), num: Number(studentId.slice(i + 1)) };
}

// 같은 모둠의 다른 학생 중 itemId를 가진 학생 ID. 없으면 null.
function findGroupmateHolder(claims, studentId, itemId) {
  const { group } = parseStudentId(studentId);
  for (let n = 1; n <= MEMBERS_PER_GROUP; n++) {
    const sid = makeStudentId(group, n);
    if (sid !== studentId && claims[sid] === itemId) return sid;
  }
  return null;
}

const Store = (() => {
  const KEY = 'gi-local-db';
  const listeners = new Set();

  function read() {
    const db = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { claims: db.claims || {}, entries: db.entries || {} };
  }
  function emit(db) {
    listeners.forEach((fn) => fn(db));
  }
  function write(db) {
    localStorage.setItem(KEY, JSON.stringify(db));
    emit(db);
  }

  window.addEventListener('storage', (e) => {
    if (e.key === KEY) emit(read());
  });

  return {
    // fn({ claims, entries })를 지금 한 번, 이후 바뀔 때마다 부른다.
    subscribe(fn) {
      listeners.add(fn);
      fn(read());
      return () => listeners.delete(fn);
    },

    // 성공: { ok: true }, 같은 모둠이 이미 가짐: { ok: false, holder }
    async claim(studentId, itemId) {
      const db = read();
      const holder = findGroupmateHolder(db.claims, studentId, itemId);
      if (holder) return { ok: false, holder };
      if (db.claims[studentId] !== itemId) delete db.entries[studentId];
      db.claims[studentId] = itemId;
      write(db);
      return { ok: true };
    },

    // 자료를 내려놓으면 작성한 정리도 함께 지운다.
    async release(studentId) {
      const db = read();
      delete db.claims[studentId];
      delete db.entries[studentId];
      write(db);
      return { ok: true };
    },
  };
})();
