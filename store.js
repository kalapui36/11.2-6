// 데이터 저장소. 학생 화면과 교사 화면이 함께 사용한다.
// firebase-config.js에 설정값이 있으면 Firebase Realtime Database를,
// 없으면 이 브라우저의 localStorage를 쓰는 시험 모드를 쓴다(같은 브라우저의 탭끼리만 반영).
//
// 데이터 구조
//   /claims/{studentId}  = itemId
//   /entries/{studentId} = { itemId, text, updatedAt }

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

// 인터넷이 끊겨 응답이 없으면 기다리지 않고 실패로 처리한다.
function withTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// 두 저장소 모두 같은 사용법을 지킨다.
//   subscribe(fn)        fn({ claims, entries })를 지금 한 번, 이후 바뀔 때마다 부른다.
//   onConnection(fn)     fn(true/false) 서버 연결 상태
//   claim(sid, itemId)   성공 { ok: true }, 같은 모둠이 이미 가짐 { ok: false, holder }
//   release(sid)         자료를 내려놓고 작성한 정리도 함께 지운다.

function createLocalStore() {
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
    mode: 'local',
    subscribe(fn) {
      listeners.add(fn);
      fn(read());
      return () => listeners.delete(fn);
    },
    onConnection(fn) {
      fn(true);
    },
    async claim(studentId, itemId) {
      const db = read();
      const holder = findGroupmateHolder(db.claims, studentId, itemId);
      if (holder) return { ok: false, holder };
      if (db.claims[studentId] !== itemId) delete db.entries[studentId];
      db.claims[studentId] = itemId;
      write(db);
      return { ok: true };
    },
    async release(studentId) {
      const db = read();
      delete db.claims[studentId];
      delete db.entries[studentId];
      write(db);
      return { ok: true };
    },
  };
}

function createFirebaseStore(config) {
  firebase.initializeApp(config);
  const db = firebase.database();
  const data = { claims: {}, entries: {} };
  const listeners = new Set();
  const loaded = { claims: false, entries: false };

  function emit() {
    if (!loaded.claims || !loaded.entries) return;
    const snapshot = { claims: { ...data.claims }, entries: { ...data.entries } };
    listeners.forEach((fn) => fn(snapshot));
  }

  ['claims', 'entries'].forEach((key) => {
    db.ref(key).on('value', (snap) => {
      data[key] = snap.val() || {};
      loaded[key] = true;
      emit();
    });
  });

  return {
    mode: 'firebase',
    subscribe(fn) {
      listeners.add(fn);
      if (loaded.claims && loaded.entries) fn({ claims: { ...data.claims }, entries: { ...data.entries } });
      return () => listeners.delete(fn);
    },
    onConnection(fn) {
      db.ref('.info/connected').on('value', (snap) => fn(snap.val() === true));
    },

    // 여러 크롬북에서 동시에 눌러도 같은 모둠 중복이 생기지 않도록 /claims 전체를 트랜잭션으로 바꾼다.
    async claim(studentId, itemId) {
      let holder = null;
      let prev = null;
      const result = await withTimeout(db.ref('claims').transaction((claims) => {
        claims = claims || {};
        holder = findGroupmateHolder(claims, studentId, itemId);
        if (holder) return undefined;   // 중단
        prev = claims[studentId] || null;
        claims[studentId] = itemId;
        return claims;
      }, undefined, false));

      if (!result.committed) return { ok: false, holder };
      if (prev !== itemId) await withTimeout(db.ref(`entries/${studentId}`).remove());
      return { ok: true };
    },

    async release(studentId) {
      await withTimeout(db.ref().update({
        [`claims/${studentId}`]: null,
        [`entries/${studentId}`]: null,
      }));
      return { ok: true };
    },
  };
}

const Store = (typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL)
  ? createFirebaseStore(FIREBASE_CONFIG)
  : createLocalStore();
