// 학생 화면
(() => {
  const ME_KEY = 'gi-student';
  const DRAFT_KEY = 'gi-draft';   // 저장 전 쓰던 정리. 새로고침해도 남도록 브라우저에 보관
  const TEXT_MAX = 300;
  const itemsById = Object.fromEntries(ITEMS.map((it) => [it.id, it]));
  const groupsById = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
  const itemOrder = seededShuffle(ITEMS.map((it) => it.id), SHUFFLE_SEED);

  const state = {
    me: loadMe(),          // { group, num } 또는 null
    pick: { group: null, num: null },  // 입장 화면에서 고르는 중인 값
    tab: 'items',          // 'items' | 'mine' | 'friends'
    openItemId: null,      // 상세 화면에 열린 자료
    explain: false,        // 설명 모드
    busy: false,
    draft: loadDraft(),    // { sid, itemId, text } 또는 null
    db: { claims: {}, entries: {}, settings: {} },
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

  function loadDraft() {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY));
    } catch (e) {
      return null;
    }
  }

  function setDraft(draft) {
    state.draft = draft;
    if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else localStorage.removeItem(DRAFT_KEY);
  }

  // 지금 자료에 대해 저장된 정리 글. 없으면 null.
  function savedText(sid, itemId) {
    const entry = state.db.entries[sid];
    return entry && entry.itemId === itemId ? entry.text : null;
  }

  // 입력 칸에 보여 줄 글: 쓰던 글 → 저장된 글 → (문장 틀 대상이면) 문장 틀
  function currentText() {
    const sid = myId();
    const itemId = myItemId();
    const d = state.draft;
    if (d && d.sid === sid && d.itemId === itemId) return d.text;
    const saved = savedText(sid, itemId);
    if (saved !== null) return saved;
    return SUPPORT_STUDENTS.includes(sid) ? SENTENCE_FRAME : '';
  }

  function isDirty() {
    return currentText() !== (savedText(myId(), myItemId()) ?? '');
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
    const active = document.activeElement;
    const caret = active && active.id === 'entry-text'
      ? [active.selectionStart, active.selectionEnd, active.scrollTop] : null;
    renderMain();
    renderOverlay();
    if (caret) {
      const ta = document.getElementById('entry-text');
      if (ta) {
        ta.focus();
        ta.setSelectionRange(caret[0], caret[1]);
        ta.scrollTop = caret[2];
      }
    }
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
      ['friends', state.db.settings.friendsOpen ? '친구 카드' : '친구 카드 🔒'],
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
    const text = currentText();
    return `
      <article class="mycard">
        <div class="detail">
          <img src="${esc(it.image)}" alt="">
          <div class="content">
            <h2>${esc(it.title)}</h2>
            <p class="body">${esc(it.body)}</p>
            <p class="meta">출처: ${esc(it.source)} · ${esc(it.date)}</p>
          </div>
        </div>
        <div class="writer">
          <label for="entry-text">자료의 문제 상황과 심각성을 1~2문장으로 정리해 보세요.</label>
          <textarea id="entry-text" rows="3" maxlength="${TEXT_MAX}"
            placeholder="어디에서 어떤 문제가 일어나고 있나요? 얼마나 심각한가요?">${esc(text)}</textarea>
          <div class="writer-bar">
            <span id="save-state" class="save-state">${saveStateHtml()}</span>
            <button class="btn btn-ghost btn-large" data-action="explain">설명 모드</button>
            <button id="save-btn" class="btn btn-large" data-action="save"
              ${!isDirty() || !text.trim() || state.busy ? 'disabled' : ''}>저장</button>
          </div>
        </div>
      </article>`;
  }

  function saveStateHtml() {
    const entry = state.db.entries[myId()];
    if (isDirty()) return '<span class="dirty">● 아직 저장하지 않았어요</span>';
    if (entry && entry.itemId === myItemId()) {
      const t = new Date(entry.updatedAt);
      const hm = `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`;
      return `<span class="saved">✔ 저장했어요 (${hm})</span>`;
    }
    return '';
  }

  // 입력할 때마다 화면 전체를 다시 그리지 않고 저장 상태만 바꾼다.
  function updateSaveBar() {
    const st = document.getElementById('save-state');
    const btn = document.getElementById('save-btn');
    if (st) st.innerHTML = saveStateHtml();
    if (btn) btn.disabled = !isDirty() || !currentText().trim() || state.busy;
  }

  function renderFriends() {
    if (!state.db.settings.friendsOpen) {
      return `<div class="empty">🔒 친구 카드는 선생님이 열어 주시면 볼 수 있어요.</div>`;
    }
    const sections = GROUPS.map((g) => {
      const cards = Array.from({ length: MEMBERS_PER_GROUP }, (_, i) => i + 1).map((n) => {
        const sid = makeStudentId(g.id, n);
        const itemId = state.db.claims[sid];
        const it = itemsById[itemId];
        if (!it) {
          return `
            <div class="fcard empty-card">
              <span class="who">${n}번</span>
              <p class="none">아직 자료를 가져가지 않았어요.</p>
            </div>`;
        }
        const text = savedText(sid, itemId);
        return `
          <div class="fcard">
            <span class="who">${n}번</span>
            <img src="${esc(it.image)}" alt="" loading="lazy">
            <div class="fbody">
              <h3>${esc(it.title)}</h3>
              ${text ? `<p>${esc(text)}</p>` : '<p class="none">아직 정리하지 않았어요.</p>'}
            </div>
          </div>`;
      }).join('');
      return `
        <section class="fgroup">
          <h2>${esc(g.name)} 모둠</h2>
          <div class="fgrid">${cards}</div>
        </section>`;
    }).join('');
    return `<p class="hint">친구들이 정리한 내용을 읽고 정리표를 보완해 보세요.</p>${sections}`;
  }

  function renderOverlay() {
    if (state.explain) renderExplain();
    else renderDetail();
  }

  // 직소 때 친구에게 보여 주는 전체 화면: 사진을 크게, 그 아래 내가 쓴 문장을 크게
  function renderExplain() {
    const it = itemsById[myItemId()];
    if (!it) {
      state.explain = false;
      modalRoot.innerHTML = '';
      return;
    }
    const text = savedText(myId(), it.id);
    modalRoot.innerHTML = `
      <div class="explain" role="dialog" aria-modal="true">
        <button class="btn btn-ghost explain-close" data-action="close-explain">✕ 닫기</button>
        <img src="${esc(it.image)}" alt="">
        <h2>${esc(it.title)}</h2>
        ${text ? `<p class="explain-text">${esc(text)}</p>` : '<p class="explain-text none">아직 정리를 저장하지 않았어요.</p>'}
      </div>`;
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
      if (res.ok) {
        setDraft(null);
        toast('자료를 가져갔어요.');
      }
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
      setDraft(null);
      toast('자료를 내려놓았어요.');
    } catch (e) {
      toast('저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.');
    } finally {
      state.busy = false;
      render();
    }
  }

  async function save() {
    const text = currentText().trim();
    if (!text) return;
    if (text.includes('___')) {
      const ok = await confirmBox('빈칸(___)이 남아 있어요.', '빈칸을 채웠는지 확인해 보세요. 그래도 저장할까요?', '저장');
      if (!ok) return;
    }
    const itemId = myItemId();
    state.busy = true;
    updateSaveBar();
    try {
      await Store.saveEntry(myId(), itemId, text);
      setDraft(null);
      toast('저장했어요.');
    } catch (e) {
      toast('저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.');
    } finally {
      state.busy = false;
      render();
    }
  }

  async function openExplain() {
    if (isDirty() && currentText().trim()) {
      const ok = await confirmBox('저장하지 않은 내용이 있어요.', '저장한 문장만 설명 모드에 나와요. 저장하고 열까요?', '저장하고 열기');
      if (!ok) return;
      await save();
      if (isDirty()) return;   // 저장 실패
    }
    state.explain = true;
    renderOverlay();
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

  function closeExplain() {
    state.explain = false;
    renderOverlay();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }

  async function resetMe() {
    const ok = await confirmBox('모둠과 번호를 다시 고를까요?', '', '다시 고르기');
    if (!ok) return;
    localStorage.removeItem(ME_KEY);
    state.me = null;
    state.pick = { group: null, num: null };
    state.openItemId = null;
    state.explain = false;
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
      case 'save':
        save();
        break;
      case 'explain':
        openExplain();
        break;
      case 'close-explain':
        closeExplain();
        break;
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id !== 'entry-text') return;
    setDraft({ sid: myId(), itemId: myItemId(), text: e.target.value });
    updateSaveBar();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.explain) {
      closeExplain();
      return;
    }
    if (e.key === 'Escape' && state.openItemId && !document.querySelector('.confirm')) {
      state.openItemId = null;
      renderDetail();
    }
  });

  // 전체 화면을 Esc 등으로 빠져나오면 설명 모드도 닫는다.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && state.explain) closeExplain();
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
