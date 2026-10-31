// 학생 화면
(() => {
  const ME_KEY = 'gi-student';
  const itemsById = Object.fromEntries(ITEMS.map((it) => [it.id, it]));
  const groupsById = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
  const itemOrder = seededShuffle(ITEMS.map((it) => it.id), SHUFFLE_SEED);

  const state = {
    me: loadMe(),          // { group, num } 또는 null
    pick: { group: null, num: null },  // 입장 화면에서 고르는 중인 값
    tab: 'items',          // 'items' | 'mine' | 'friends'
    openItemId: null,      // 상세 화면에 열린 자료
    busy: false,
    db: { claims: {}, entries: {} },
  };

  const app = document.getElementById('app');
  const modalRoot = document.getElementById('modal-root');
  const toastEl = document.getElementById('toast');

  // ---------- 도움 함수 ----------
  function seededShuffle(arr, seed) {
    const a = arr.slice();
    let s = seed >>> 0;
    const rand = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function loadMe() {
    try {
      const me = JSON.parse(localStorage.getItem(ME_KEY));
      if (me && groupsById[me.group] && me.num >= 1 && me.num <= MEMBERS_PER_GROUP) return me;
    } catch (e) { /* 저장값이 깨졌으면 다시 고르게 한다 */ }
    return null;
  }

  function myId() {
    return makeStudentId(state.me.group, state.me.num);
  }

  function myItemId() {
    return state.db.claims[myId()] || null;
  }

  // 같은 모둠 친구가 가진 자료면 그 친구 번호, 아니면 null
  function mateNumFor(itemId) {
    const holder = findGroupmateHolder(state.db.claims, myId(), itemId);
    return holder ? parseStudentId(holder).num : null;
  }

  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2500);
  }

  // 확인 창. 예를 누르면 true.
  function confirmBox(message, sub = '', okLabel = '네', okClass = 'btn') {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'overlay';
      wrap.style.zIndex = 150;
      wrap.innerHTML = `
        <div class="modal confirm" role="alertdialog" aria-modal="true">
          <p>${esc(message)}</p>
          ${sub ? `<p class="sub">${esc(sub)}</p>` : ''}
          <div class="buttons">
            <button class="btn btn-ghost btn-large" data-answer="no">아니요</button>
            <button class="${okClass} btn-large" data-answer="yes">${esc(okLabel)}</button>
          </div>
        </div>`;
      wrap.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-answer]');
        if (!btn && e.target !== wrap) return;
        wrap.remove();
        resolve(btn?.dataset.answer === 'yes');
      });
      document.body.appendChild(wrap);
      wrap.querySelector('[data-answer="yes"]').focus();
    });
  }

  // ---------- 그리기 ----------
  function render() {
    if (!state.me) {
      renderEntry();
      modalRoot.innerHTML = '';
      return;
    }
    renderMain();
    renderDetail();
  }

  function renderEntry() {
    const { group, num } = state.pick;
    const groupButtons = GROUPS.map((g) => `
      <button class="choice" data-action="pick-group" data-group="${g.id}"
        aria-pressed="${group === g.id}">${esc(g.name)}</button>`).join('');
    const numButtons = Array.from({ length: MEMBERS_PER_GROUP }, (_, i) => i + 1).map((n) => `
      <button class="choice num" data-action="pick-num" data-num="${n}"
        aria-pressed="${num === n}">${n}</button>`).join('');

    app.innerHTML = `
      <section class="entry">
        <h1>지구촌 문제 자료 탐색</h1>
        <p class="lead">우리 모둠과 내 번호를 골라 주세요.</p>
        <h2>① 우리 모둠</h2>
        <div class="choice-row">${groupButtons}</div>
        <h2>② 내 번호</h2>
        <div class="choice-row">${numButtons}</div>
        <button class="btn btn-large start" data-action="start" ${group && num ? '' : 'disabled'}>시작하기</button>
      </section>`;
  }

  function renderMain() {
    const group = groupsById[state.me.group];
    const tabs = [
      ['items', '자료 모음'],
      ['mine', '내 카드'],
      ['friends', '친구 카드'],
    ].map(([id, label]) => `
      <button class="tab" role="tab" data-action="tab" data-tab="${id}"
        aria-selected="${state.tab === id}">${label}</button>`).join('');

    let content = '';
    if (state.tab === 'items') content = renderItems();
    else if (state.tab === 'mine') content = renderMine();
    else content = renderFriends();

    app.innerHTML = `
      <header class="topbar">
        <div class="topbar-inner">
          <span class="brand">🌏 지구촌 문제 자료 탐색</span>
          ${Store.mode === 'local' ? '<span class="mode-note">시험 모드: 이 브라우저에만 저장돼요</span>' : ''}
          <span class="me">${esc(group.name)} · <span class="num">${state.me.num}번</span></span>
          <button class="btn btn-ghost reset" data-action="reset-me">다시 고르기</button>
        </div>
        <nav class="tabs" role="tablist">${tabs}</nav>
      </header>
      <main>${content}</main>`;
  }

  function renderItems() {
    const mine = myItemId();
    const cards = itemOrder.map((id) => {
      const it = itemsById[id];
      const mateNum = mateNumFor(id);
      let cls = 'card';
      let badge = '';
      if (id === mine) {
        cls += ' is-mine';
        badge = '<span class="badge mine">내 자료</span>';
      } else if (mateNum) {
        cls += ' is-mate';
        badge = `<span class="badge mate">우리 모둠 ${mateNum}번</span>`;
      }
      return `
        <button class="${cls}" data-action="open" data-item="${id}">
          ${badge}
          <img src="${esc(it.image)}" alt="" loading="lazy">
          <span class="title">${esc(it.title)}</span>
        </button>`;
    }).join('');

    return `
      <p class="hint">카드를 눌러 자료를 읽고, 우리 모둠 주제에 해당하는 자료를 하나 가져가세요.</p>
      <div class="grid">${cards}</div>`;
  }

  function renderMine() {
    const id = myItemId();
    if (!id) {
      return `<div class="empty">아직 가져간 자료가 없어요.<br>'자료 모음'에서 자료를 골라 가져가세요.</div>`;
    }
    const it = itemsById[id];
    // 정리 입력, 설명 모드는 3단계에서 추가
    return `
      <article class="mycard detail">
        <img src="${esc(it.image)}" alt="">
        <div class="content">
          <h2>${esc(it.title)}</h2>
          <p class="body">${esc(it.body)}</p>
          <p class="meta">출처: ${esc(it.source)} · ${esc(it.date)}</p>
        </div>
      </article>`;
  }

  function renderFriends() {
    // 3단계에서 추가
    return `<div class="empty">친구 카드는 준비 중이에요.</div>`;
  }

  function renderDetail() {
    const id = state.openItemId;
    if (!id) {
      modalRoot.innerHTML = '';
      return;
    }
    const it = itemsById[id];
    const mine = myItemId();
    const mateNum = mateNumFor(id);

    let actions;
    if (id === mine) {
      actions = `
        <span class="status mine">✔ 내가 가져간 자료예요.</span>
        <button class="btn btn-danger btn-large" data-action="release" ${state.busy ? 'disabled' : ''}>내려놓기</button>`;
    } else if (mateNum) {
      actions = `
        <span class="status mate">우리 모둠 ${mateNum}번이 이미 가져갔어요.</span>
        <button class="btn btn-large" disabled>가져가기</button>`;
    } else {
      actions = `<button class="btn btn-large" data-action="claim" ${state.busy ? 'disabled' : ''}>가져가기</button>`;
    }

    modalRoot.innerHTML = `
      <div class="overlay" data-action="close">
        <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(it.title)}">
          <button class="close" data-action="close" aria-label="닫기">✕</button>
          <div class="detail">
            <img src="${esc(it.image)}" alt="">
            <div class="content">
              <h2>${esc(it.title)}</h2>
              <p class="body">${esc(it.body)}</p>
              <p class="meta">출처: ${esc(it.source)} · ${esc(it.date)}</p>
              <div class="actions">${actions}</div>
            </div>
          </div>
        </div>
      </div>`;
  }

  // ---------- 동작 ----------
  async function claim() {
    const id = state.openItemId;
    const current = myItemId();
    if (current && current !== id) {
      const hasEntry = !!state.db.entries[myId()];
      const ok = await confirmBox(
        '지금 가진 자료를 내려놓고 이 자료를 가져갈까요?',
        hasEntry ? '지금 자료에 쓴 정리도 함께 지워져요.' : '',
      );
      if (!ok) return;
    }
    state.busy = true;
    renderDetail();
    try {
      const res = await Store.claim(myId(), id);
      if (res.ok) toast('자료를 가져갔어요.');
      else toast(`우리 모둠 ${parseStudentId(res.holder).num}번이 먼저 가져갔어요.`);
    } catch (e) {
      toast('저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.');
    } finally {
      state.busy = false;
      render();
    }
  }

  async function release() {
    const ok = await confirmBox(
      '이 자료를 내려놓을까요?',
      '작성한 정리도 함께 지워져요.',
      '내려놓기',
      'btn btn-danger',
    );
    if (!ok) return;
    state.busy = true;
    renderDetail();
    try {
      await Store.release(myId());
      toast('자료를 내려놓았어요.');
    } catch (e) {
      toast('저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.');
    } finally {
      state.busy = false;
      render();
    }
  }

  async function resetMe() {
    const ok = await confirmBox('모둠과 번호를 다시 고를까요?', '', '다시 고르기');
    if (!ok) return;
    localStorage.removeItem(ME_KEY);
    state.me = null;
    state.pick = { group: null, num: null };
    state.openItemId = null;
    state.tab = 'items';
    render();
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;

    // 바깥 어두운 부분을 눌렀을 때만 닫고, 모달 안쪽 클릭은 무시한다.
    if (action === 'close' && el.classList.contains('overlay') && e.target !== el) return;

    switch (action) {
      case 'pick-group':
        state.pick.group = el.dataset.group;
        render();
        break;
      case 'pick-num':
        state.pick.num = Number(el.dataset.num);
        render();
        break;
      case 'start':
        state.me = { ...state.pick };
        localStorage.setItem(ME_KEY, JSON.stringify(state.me));
        render();
        break;
      case 'reset-me':
        resetMe();
        break;
      case 'tab':
        state.tab = el.dataset.tab;
        render();
        break;
      case 'open':
        state.openItemId = el.dataset.item;
        renderDetail();
        break;
      case 'close':
        state.openItemId = null;
        renderDetail();
        break;
      case 'claim':
        claim();
        break;
      case 'release':
        release();
        break;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.openItemId && !document.querySelector('.confirm')) {
      state.openItemId = null;
      renderDetail();
    }
  });

  // 연결이 3초 넘게 끊겨 있을 때만 알림 띠를 보여 준다(처음 연결 중에는 숨김).
  const offlineEl = document.getElementById('offline');
  let offlineTimer = null;
  Store.onConnection((connected) => {
    clearTimeout(offlineTimer);
    if (connected) offlineEl.hidden = true;
    else offlineTimer = setTimeout(() => { offlineEl.hidden = false; }, 3000);
  });

  Store.subscribe((db) => {
    state.db = db;
    render();
  });
})();
