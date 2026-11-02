// 데이터 저장소. 학생 화면과 교사 화면이 함께 사용한다.
// firebase-config.js에 설정값이 있으면 Firebase Realtime Database를,
// 없으면 이 브라우저의 localStorage를 쓰는 시험 모드를 쓴다(같은 브라우저의 탭끼리만 반영).
//
// 데이터 구조
//   /claims/{group}/{studentId} = itemId   (모둠별로 나눠 저장해 동시에 눌러도 같은 모둠끼리만 순서를 기다린다)
//   /entries/{studentId} = { itemId, text, updatedAt }
//   /online/{studentId}/{deviceId} = true  (지금 이 번호로 접속한 기기. 창을 닫으면 저절로 지워짐)
//   /settings/friendsOpen = true/false   (친구 보고서 탭 열기, 교사가 바꿈)
//   /settings/linksOpen   = true/false   (자료 상세 화면의 관련 자료 링크 보이기, 교사가 바꿈)
//   /settings/supportIds  = 'climate-2,refugee-3'  (쓰기 도움 학생)
// 화면 코드에는 claims를 { studentId: itemId } 한 겹으로 펴서 넘긴다.

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

// 이 기기의 고유 번호(같은 번호로 두 기기가 들어오는 것을 알아보는 데 쓴다)
function deviceId() {
  try {
    let id = localStorage.getItem('gi-device');
    if (!id || !/^[a-z0-9]{8,20}$/.test(id)) {
      id = Math.random().toString(36).slice(2, 12).padEnd(10, '0');
      localStorage.setItem('gi-device', id);
    }
    return id;
  } catch (e) {
    return 'nostore' + Math.random().toString(36).slice(2, 8);
  }
}

// 이 번호로 접속 중인 다른 기기 수
function otherDevices(online, studentId, myDevice) {
  return Object.keys((online || {})[studentId] || {}).filter((d) => d !== myDevice).length;
}

// 인터넷이 끊겨 응답이 없으면 기다리지 않고 실패로 처리한다.
function withTimeout(promise, ms = 12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// 두 저장소 모두 같은 사용법을 지킨다.
//   subscribe(fn)        fn({ claims, entries, settings, online })를 지금 한 번, 이후 바뀔 때마다 부른다.
//   onConnection(fn)     fn(true/false) 서버 연결 상태
//   setPresence(sid)     이 기기가 sid로 접속 중이라고 알린다(null이면 지움).
//   clearEntry(sid)      교사용: 그 학생의 정리만 지운다.
//   claim(sid, itemId)   성공 { ok: true }, 같은 모둠이 이미 가짐 { ok: false, holder }
//   release(sid)         자료를 내려놓고 작성한 정리도 함께 지운다.
//   saveEntry(sid, itemId, text)  정리 저장
//   setSetting(key, value)        교사 설정 저장
//   resetAll()                    모든 claims, entries를 지우고 친구 카드를 닫는다.

function createLocalStore() {
  const KEY = 'gi-local-db';
  const listeners = new Set();

  function read() {
    const db = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { claims: db.claims || {}, entries: db.entries || {}, settings: db.settings || {}, online: {} };
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
    setPresence() {},
    async clearEntry(studentId) {
      const db = read();
      delete db.entries[studentId];
      write(db);
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
    async saveEntry(studentId, itemId, text) {
      const db = read();
      if (db.claims[studentId] !== itemId) throw new Error('not-claimed');
      db.entries[studentId] = { itemId, text, updatedAt: Date.now() };
      write(db);
    },
    async setSetting(key, value) {
      const db = read();
      db.settings[key] = value;
      write(db);
    },
    async resetAll() {
      const db = read();
      write({ claims: {}, entries: {}, settings: { ...db.settings, friendsOpen: false, linksOpen: false } });
    },
  };
}

function createFirebaseStore(config) {
  firebase.initializeApp(config);
  const db = firebase.database();
  const KEYS = ['claims', 'entries', 'settings', 'online'];
  const data = { claims: {}, entries: {}, settings: {}, online: {} };
  const myDevice = deviceId();
  let presenceRef = null;
  let presenceSid = null;
  const listeners = new Set();
  const loaded = {};

  function ready() {
    return KEYS.every((k) => loaded[k]);
  }
  function snapshot() {
    return { claims: { ...data.claims }, entries: { ...data.entries }, settings: { ...data.settings }, online: { ...data.online } };
  }
  function emit() {
    if (!ready()) return;
    const snap = snapshot();
    listeners.forEach((fn) => fn(snap));
  }

  // /claims/{group}/{sid} → { sid: itemId }
  function flattenClaims(tree) {
    const out = {};
    for (const [group, members] of Object.entries(tree || {})) {
      if (!members || typeof members !== 'object') continue;   // 예전 구조의 값은 무시
      for (const [sid, itemId] of Object.entries(members)) {
        if (typeof itemId === 'string' && sid.startsWith(group + '-')) out[sid] = itemId;
      }
    }
    return out;
  }

  KEYS.forEach((key) => {
    db.ref(key).on('value', (snap) => {
      const v = snap.val() || {};
      data[key] = key === 'claims' ? flattenClaims(v) : v;
      loaded[key] = true;
      emit();
    });
  });

  // 연결될 때마다 접속 중 표시를 다시 올리고, 끊기면 서버가 지우게 한다.
  db.ref('.info/connected').on('value', (snap) => {
    if (snap.val() === true && presenceSid) attachPresence();
  });
  function attachPresence() {
    presenceRef = db.ref(`online/${presenceSid}/${myDevice}`);
    presenceRef.onDisconnect().remove();
    presenceRef.set(true).catch(() => {});
  }

  return {
    mode: 'firebase',
    subscribe(fn) {
      listeners.add(fn);
      if (ready()) fn(snapshot());
      return () => listeners.delete(fn);
    },
    myDevice,
    onConnection(fn) {
      db.ref('.info/connected').on('value', (snap) => fn(snap.val() === true));
    },

    setPresence(studentId) {
      if (presenceRef) {
        presenceRef.onDisconnect().cancel();
        presenceRef.remove().catch(() => {});
        presenceRef = null;
      }
      presenceSid = studentId;
      if (studentId) attachPresence();
    },

    // 같은 모둠 중복이 생기지 않도록 그 모둠의 /claims/{group}만 트랜잭션으로 바꾼다.
    // 다른 모둠과는 서로 기다리지 않아서 반 전체가 동시에 눌러도 빠르다.
    async claim(studentId, itemId) {
      const { group } = parseStudentId(studentId);
      let holder = null;
      let prev = null;
      const result = await withTimeout(db.ref(`claims/${group}`).transaction((members) => {
        members = members || {};
        holder = findGroupmateHolder(members, studentId, itemId);
        if (holder) return undefined;   // 중단
        prev = members[studentId] || null;
        members[studentId] = itemId;
        return members;
      }, undefined, false));

      if (!result.committed) return { ok: false, holder };
      if (prev !== itemId) await withTimeout(db.ref(`entries/${studentId}`).remove());
      return { ok: true };
    },

    async release(studentId) {
      const { group } = parseStudentId(studentId);
      await withTimeout(db.ref().update({
        [`claims/${group}/${studentId}`]: null,
        [`entries/${studentId}`]: null,
      }));
      return { ok: true };
    },

    async clearEntry(studentId) {
      await withTimeout(db.ref(`entries/${studentId}`).remove());
    },

    // 서버가 받았을 때 끝나는 약속(Promise)을 그대로 돌려준다. 기다리는 시간 제한은 화면 쪽에서 건다.
    // 인터넷이 끊겨 있어도 이 기기에 줄 세워 두었다가 연결되면 저절로 보낸다.
    saveEntry(studentId, itemId, text) {
      // 저장 직전에 다른 자료로 바꾼 경우를 막는다.
      if (data.claims[studentId] !== itemId) return Promise.reject(new Error('not-claimed'));
      return db.ref(`entries/${studentId}`).set({
        itemId,
        text,
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
      });
    },

    async setSetting(key, value) {
      await withTimeout(db.ref(`settings/${key}`).set(value));
    },

    async resetAll() {
      await withTimeout(db.ref().update({
        claims: null,
        entries: null,
        'settings/friendsOpen': false,
        'settings/linksOpen': false,
      }));
    },
  };
}

// Firebase 프로그램(gstatic.com)을 못 불러왔으면 빈 화면 대신 안내를 보여 주고 멈춘다.
function bootError() {
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `
      <div class="boot-error">
        <h1>수업 프로그램을 불러오지 못했어요</h1>
        <p>인터넷 연결을 확인하고 새로고침해 보세요.</p>
        <p>학교 인터넷에서 www.gstatic.com 접속이 막혀 있으면 이렇게 보일 수 있어요. 선생님께 알려 주세요.</p>
      </div>`;
  }
}

const Store = (() => {
  const hasConfig = typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL;
  if (!hasConfig) return createLocalStore();
  if (typeof firebase === 'undefined') {
    bootError();
    return null;
  }
  return createFirebaseStore(FIREBASE_CONFIG);
})();
