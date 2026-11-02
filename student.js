// 학생 화면
(() => {
  if (!Store) return;   // 프로그램을 못 불러온 경우(store.js가 안내를 띄움)
  const ME_KEY = 'gi-student';
  const DRAFT_KEY = 'gi-draft';   // 저장 전 쓰던 정리. 새로고침해도 남도록 브라우저에 보관
  const TEXT_MAX = 300;
  const itemsById = Object.fromEntries(ITEMS.map((it) => [it.id, it]));
  const groupsById = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

  const state = {
    me: loadMe(),          // { group, num } 또는 null
    pick: { group: null, num: null },  // 입장 화면에서 고르는 중인 값
    tab: 'items',          // 'items' | 'mine' | 'friends'
    openItemId: null,      // 상세 화면에 열린 자료
    explain: false,        // 설명 모드
    justClaimed: null,     // 방금 가져간 자료(도장 찍히는 움직임용)
    helper: null,          // 낱말 골라 문장 만들기 창 { step, picks: { where, what, how } }
    busy: false,
    savePending: false,    // 인터넷이 끊겨 저장이 서버에 아직 안 간 상태(연결되면 저절로 감)
    loaded: false,         // 서버에서 처음 자료를 받아 왔는지
    composing: false,      // 한글 조합 중(이때는 화면을 다시 그리지 않는다)
    pendingRender: false,
    draft: loadDraft(),    // { sid, itemId, text } 또는 null
    db: { claims: {}, entries: {}, settings: {}, online: {} },
  };

  const app = document.getElementById('app');
  const modalRoot = document.getElementById('modal-root');

  // ---------- 도움 함수 ----------
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

  // 쓰기 도움 학생: 교사 화면에서 켠 학생(settings.supportIds) 또는 data.js의 SUPPORT_STUDENTS
  function isSupport() {
    const sid = myId();
    const ids = String(state.db.settings.supportIds || '').split(',');
    return ids.includes(sid) || SUPPORT_STUDENTS.includes(sid);
  }

  // 지금 자료의 낱말 고르기 보기. 쓰기 도움 학생이 아니거나 보기가 없는 자료면 null.
  function helperChoices() {
    const id = myItemId();
    return isSupport() && id && SUPPORT_CHOICES[id] ? SUPPORT_CHOICES[id] : null;
  }

  // 입력 칸에 보여 줄 글: 쓰던 글 → 저장된 글 → (쓰기 도움인데 보기가 없는 자료면) 문장 틀
  function currentText() {
    const sid = myId();
    const itemId = myItemId();
    const d = state.draft;
    if (d && d.sid === sid && d.itemId === itemId) return d.text;
    const saved = savedText(sid, itemId);
    if (saved !== null) return saved;
    return isSupport() && !helperChoices() ? SENTENCE_FRAME : '';
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

  // 이 번호로 접속한 다른 기기 수
  function otherDeviceCount(sid) {
    return otherDevices(state.db.online, sid, Store.myDevice);
  }

  // ---------- 그리기 ----------
  // 내용이 바뀌었을 때만 화면을 바꾼다. 친구가 자료를 가져갈 때마다 입력칸이나 열린 창이
  // 새로 만들어지면 한글 조합이 깨지고 누르던 버튼이 사라지기 때문이다.
  function setHtml(el, html) {
    if (el.__html === html) return false;
    el.innerHTML = html;
    el.__html = html;
    return true;
  }

  function render() {
    if (state.composing) {
      state.pendingRender = true;
      return;
    }
    state.pendingRender = false;
    if (!state.me) {
      renderEntry();
      setHtml(modalRoot, '');
      return;
    }
    const active = document.activeElement;
    const caret = active && active.id === 'entry-text'
      ? [active.selectionStart, active.selectionEnd, active.scrollTop] : null;
    const changed = renderMain();
    updateSaveBar();
    renderOverlay();
    if (caret && changed) {
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
    const groupButtons = GROUPS.map((g) => {
      const st = GROUP_STYLE[g.id];
      return `
        <button class="gchoice" data-action="pick-group" data-group="${g.id}"
          aria-pressed="${group === g.id}" style="--g:${st.color};--gs:${st.soft}">
          <span class="gchoice-icon">${emblem(g.id)}</span>
          <span class="gchoice-name">${esc(g.name)}</span>
          <span class="gchoice-check">${icon('check')}</span>
        </button>`;
    }).join('');
    // 이미 다른 기기가 접속 중인 번호는 고를 수 없다(같은 번호로 두 명이 들어가는 실수를 막음).
    const numButtons = Array.from({ length: MEMBERS_PER_GROUP }, (_, i) => i + 1).map((n) => {
      const taken = group && otherDeviceCount(makeStudentId(group, n)) > 0;
      return `
      <button class="nchoice ${taken ? 'taken' : ''}" data-action="pick-num" data-num="${n}"
        aria-pressed="${num === n && !taken}" ${taken ? 'disabled' : ''}>${n}${taken ? '<small>접속 중</small>' : ''}</button>`;
    }).join('');
    const pickedTaken = group && num && otherDeviceCount(makeStudentId(group, num)) > 0;

    setHtml(app, `
      <div class="entry">
        <section class="entry-hero">
          <p class="entry-kicker">6학년 사회 · 지구촌의 문제와 지속가능한 미래</p>
          <h1>지구촌 탐사대</h1>
          <p class="entry-sub">세계 곳곳의 자료를 살펴보고, 지구촌을 위협하는 문제를 찾아내는 탐사를 시작해요.</p>
          <div class="entry-question">
            <span class="label">탐구 질문</span>
            <p>지구촌을 위협하는 문제에는 어떤 것들이 있을까요?</p>
          </div>
          <img class="entry-cover" src="${UI_IMG}cover.webp" alt="">
        </section>
        <section class="entry-form">
          ${guideBubble('탐사대원 등록부터 해요! <b>우리 모둠</b>과 <b>내 번호</b>를 골라 주세요.')}
          <div class="step-head"><span class="step-no">1</span><h2>우리 모둠을 골라요</h2></div>
          <div class="gchoice-list">${groupButtons}</div>
          <div class="step-head"><span class="step-no">2</span><h2>내 번호를 골라요</h2></div>
          <div class="nchoice-row">${numButtons}</div>
          <p class="nchoice-note">'접속 중'인 번호는 다른 친구가 쓰고 있어요. 내 번호가 '접속 중'이면 선생님께 알려 주세요.</p>
          <button class="btn btn-large btn-block start" data-action="start" ${group && num && !pickedTaken ? '' : 'disabled'}>
            탐사 시작하기 ${icon('arrowRight')}
          </button>
        </section>
      </div>`);
  }

  // 스크롤 없이 한 화면에 맞추는 탭: 내 보고서, 비어 있거나 잠긴 화면. 자료실과 열린 친구 보고서는 스크롤한다.
  function fitMain() {
    if (state.tab === 'mine') return true;
    if (state.tab === 'friends') return !state.db.settings.friendsOpen;
    return false;
  }

  function renderMain() {
    const group = groupsById[state.me.group];
    const friendsOpen = !!state.db.settings.friendsOpen;
    const mineDone = !!savedText(myId(), myItemId());
    const tabs = [
      ['items', 'grid', '탐사 자료실', ''],
      ['mine', 'card', '내 보고서', myItemId() ? `<span class="tab-dot ${mineDone ? 'done' : ''}"></span>` : ''],
      ['friends', friendsOpen ? 'users' : 'lock', '친구 보고서', ''],
    ].map(([id, ic, label, extra]) => `
      <button class="tab" role="tab" data-action="tab" data-tab="${id}"
        aria-selected="${state.tab === id}">${icon(ic)}<span>${label}</span>${extra}</button>`).join('');

    let content = '';
    if (!state.loaded) content = `<div class="loading">${icon('globe')}<p>자료를 불러오는 중이에요…</p></div>`;
    else if (state.tab === 'items') content = renderItems();
    else if (state.tab === 'mine') content = renderMine();
    else content = renderFriends();
    const dup = otherDeviceCount(myId()) > 0
      ? `<div class="dup-warn">${icon('alert')}이 번호(${esc(group.name)} ${state.me.num}번)로 다른 기기도 접속해 있어요. 번호를 잘못 골랐는지 확인하고 선생님께 알려 주세요.</div>` : '';

    return setHtml(app, `
      <header class="topbar">
        <div class="topbar-inner">
          <div class="brand">
            <span class="brand-mark sm">${icon('globe')}</span>
            <span class="brand-text">
              <strong>지구촌 탐사대</strong>
              <small>6학년 사회 · 지구촌 문제 자료 탐색</small>
            </span>
          </div>
          ${Store.mode === 'local' ? '<span class="mode-note">시험 모드 · 이 브라우저에만 저장</span>' : ''}
          <div class="me">
            ${groupChip(group.id, `${group.name} ${state.me.num}번`)}
            <button class="btn-text" data-action="reset-me">다시 고르기</button>
          </div>
        </div>
        <nav class="tabs" role="tablist">${tabs}</nav>
        ${dup}
      </header>
      <main class="${fitMain() ? 'fit' : ''}">${content}</main>`);
  }

  function pageHead(step, title, desc, side = '') {
    return `
      <div class="page-head">
        <span class="step-pill">${step}</span>
        <div>
          <h1>${title}</h1>
          <p>${desc}</p>
        </div>
        ${side}
      </div>`;
  }

  // 우리 모둠이 자료를 몇 개 모았는지 (다른 모둠 정보는 보이지 않는다)
  function groupProgress() {
    const nums = Array.from({ length: MEMBERS_PER_GROUP }, (_, i) => i + 1);
    const got = nums.filter((n) => itemsById[state.db.claims[makeStudentId(state.me.group, n)]]);
    const dots = nums.map((n) => `<i class="${got.includes(n) ? 'on' : ''} ${n === state.me.num ? 'me' : ''}">${n}</i>`).join('');
    return `
      <div class="team-progress" style="--g:${GROUP_STYLE[state.me.group].color}">
        ${emblem(state.me.group)}
        <div>
          <small>우리 모둠 수집</small>
          <b>${got.length} / ${MEMBERS_PER_GROUP}</b>
        </div>
        <span class="team-dots">${dots}</span>
      </div>`;
  }

  function renderItems() {
    const mine = myItemId();
    const cards = ITEM_ORDER.map((id) => {
      const it = itemsById[id];
      const mateNum = mateNumFor(id);
      let cls = 'card';
      let badge = '';
      if (id === mine) {
        cls += ' is-mine';
        badge = `
          <span class="stamp ${state.justClaimed === id ? 'just' : ''}">
            <img src="${UI_IMG}stamp.webp" alt="">
            <b>수집 완료</b>
          </span>`;
      } else if (mateNum) {
        cls += ' is-mate';
        badge = `<span class="badge mate">우리 모둠 ${mateNum}번</span>`;
      }
      return `
        <button class="${cls}" data-action="open" data-item="${id}">
          <span class="card-img">
            <img src="${esc(thumbOf(it))}" alt="" loading="lazy" decoding="async">
            <span class="card-no">자료 ${ITEM_NO[id]}</span>
            ${badge}
          </span>
          <span class="card-title">${esc(it.title)}</span>
          <span class="card-more">자세히 보기 ${icon('arrowRight')}</span>
        </button>`;
    }).join('');

    return `
      ${pageHead('활동 1', '우리 모둠 주제에 맞는 자료 찾기', '카드를 눌러 자료를 읽고, 우리 모둠 주제에 해당하는 자료를 한 사람이 하나씩 가져가요.', groupProgress())}
      ${mine ? '' : guideBubble('카드를 눌러 자료를 꼼꼼히 읽어 봐요. <b>어떤 문제</b>가 일어나고 있나요?')}
      <div class="grid">${cards}</div>`;
  }

  function renderMine() {
    const id = myItemId();
    if (!id) {
      return emptyState('empty-bag', '탐사 가방이 비어 있어요', "'탐사 자료실'에서 우리 모둠 주제에 맞는 자료를 골라 가져오세요.",
        `<button class="btn btn-large" data-action="tab" data-tab="items">${icon('grid')}탐사 자료실로 가기</button>`);
    }
    const it = itemsById[id];
    // 입력칸 글자, 단계 표시, 저장 상태처럼 타자를 칠 때마다 바뀌는 부분은 여기서 그리지 않고
    // updateSaveBar()가 채운다. 그래야 친구가 무엇을 해도 입력칸이 새로 만들어지지 않는다.
    return `
      ${pageHead('활동 2', '탐사 보고서 쓰기', '자료를 다시 읽고, 어디에서 어떤 문제가 일어나는지와 얼마나 심각한지를 1~2문장으로 써요.')}
      <div class="mine-layout">
        <article class="paper">
          <div class="paper-img">
            <img src="${esc(it.image)}" alt="">
            <span class="card-no">자료 ${ITEM_NO[id]}</span>
          </div>
          <div class="paper-body">
            <h2>${esc(it.title)}</h2>
            <p class="body">${esc(it.body)}</p>
            ${metaHtml(it)}
            ${state.db.settings.linksOpen ? moreLink(it) : ''}
          </div>
        </article>
        <section class="writer">
          <ol class="steps" id="steps"></ol>
          <label for="entry-text">${icon('pencil')}나의 탐사 보고</label>
          <div class="guide">
            <span>어디에서?</span><span>어떤 문제가?</span><span>얼마나 심각한가?</span>
            ${helperChoices() ? `<button class="helper-open" data-action="helper-open">${icon('sparkle')}낱말 골라 문장 만들기</button>` : ''}
          </div>
          <textarea id="entry-text" rows="5" maxlength="${TEXT_MAX}"
            placeholder="어디에서 어떤 문제가 일어나고 있나요? 얼마나 심각한가요?"></textarea>
          <div class="writer-meta">
            <span id="save-state" class="save-state"></span>
            <span id="char-count" class="char-count"></span>
          </div>
          <div class="writer-actions">
            <button id="save-btn" class="btn btn-large" data-action="save" disabled>${icon('save')}저장</button>
            <button class="btn btn-ghost btn-large" data-action="explain">${icon('present')}설명 모드</button>
          </div>
          <p class="writer-tip">활동 3에서 친구에게 브리핑할 때 '설명 모드'를 켜요.</p>
        </section>
      </div>`;
  }

  function metaHtml(it) {
    return `
      <div class="meta">
        <span>${icon('source')}${esc(it.source)}</span>
        <span>${icon('calendar')}${esc(it.date)}</span>
      </div>
      ${it.imageCredit ? `<p class="photo-credit">사진: ${esc(it.imageCredit)}</p>` : ''}`;
  }

  function emptyState(img, title, desc, action = '') {
    return `
      <div class="empty">
        <img class="empty-img" src="${UI_IMG}${img}.webp" alt="">
        <h2>${title}</h2>
        <p>${desc}</p>
        ${action}
      </div>`;
  }

  function saveStateHtml() {
    const entry = state.db.entries[myId()];
    if (state.savePending) return '<span class="pending"><i></i>인터넷이 연결되면 저장돼요 · 화면을 닫지 마세요</span>';
    if (isDirty()) return '<span class="dirty"><i></i>아직 저장하지 않았어요</span>';
    if (entry && entry.itemId === myItemId()) {
      const t = new Date(entry.updatedAt);
      const hm = `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`;
      return `<span class="saved">${icon('check')}저장했어요 · ${hm}</span>`;
    }
    return '';
  }

  // 입력할 때마다 화면 전체를 다시 그리지 않고 입력칸 주변만 바꾼다.
  function updateSaveBar() {
    const ta = document.getElementById('entry-text');
    if (!ta || !myItemId()) return;
    const text = currentText();
    // 입력칸 글자가 지금 글과 다를 때만 바꾼다(낱말 고르기로 문장을 넣었을 때, 저장 뒤 등).
    if (ta.value !== text && !state.composing) {
      const focused = document.activeElement === ta;
      ta.value = text;
      if (focused) ta.setSelectionRange(text.length, text.length);
    }
    const steps = [
      ['자료 읽기', true],
      ['문장 쓰기', !!text.trim() && text !== SENTENCE_FRAME],
      ['저장하기', !!savedText(myId(), myItemId()) && !isDirty() && !state.savePending],
    ].map(([label, done], i) => `
      <li class="${done ? 'done' : ''}"><span>${done ? icon('check') : i + 1}</span>${label}</li>`).join('');
    setHtml(document.getElementById('steps'), steps);
    setHtml(document.getElementById('save-state'), saveStateHtml());
    const btn = document.getElementById('save-btn');
    if (btn) btn.disabled = !isDirty() || !text.trim() || state.busy;
    const cc = document.getElementById('char-count');
    if (cc) cc.textContent = `${text.length} / ${TEXT_MAX}`;
  }

  function renderFriends() {
    if (!state.db.settings.friendsOpen) {
      return emptyState('locked-chest', '친구 보고서는 아직 잠겨 있어요', '활동 3이 끝나면 선생님이 상자를 열어 주실 거예요.');
    }
    const sections = GROUPS.map((g) => {
      const st = GROUP_STYLE[g.id];
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
            <div class="fcard-img">
              <img src="${esc(thumbOf(it))}" alt="" loading="lazy" decoding="async">
              <span class="who">${n}번</span>
            </div>
            <div class="fbody">
              <h3>${esc(it.title)}</h3>
              ${text ? `<p>${esc(text)}</p>` : '<p class="none">아직 정리하지 않았어요.</p>'}
            </div>
          </div>`;
      }).join('');
      return `
        <section class="fgroup" style="--g:${st.color};--gs:${st.soft}">
          <h2>${emblem(g.id, 'fgroup-emblem')}${esc(g.name)} 모둠</h2>
          <div class="fgrid">${cards}</div>
        </section>`;
    }).join('');
    return `
      ${pageHead('정리', '친구 보고서 살펴보기', '다른 모둠 친구들의 보고서를 다시 읽고, 활동지 표에서 비어 있는 칸을 확인해요.')}
      ${sections}`;
  }

  // 열려 있던 창을 그대로 다시 그릴 때는 튀어나오는 움직임을 다시 하지 않는다(깜빡임 방지).
  function renderOverlay() {
    const key = state.explain ? 'explain' : state.helper ? 'helper' : state.openItemId;
    modalRoot.classList.toggle('no-anim', !!key && key === state.overlayKey);
    state.overlayKey = key || null;
    if (state.explain) renderExplain();
    else if (state.helper) renderHelper();
    else renderDetail();
  }

  // ---------- 낱말 골라 문장 만들기(쓰기 도움 학생) ----------
  const HELPER_STEPS = [
    ['where', '어디에서?', '어디에서 일어난 일인가요?'],
    ['what', '어떤 문제가?', '어떤 문제가 일어나고 있나요?'],
    ['how', '얼마나 심각한가?', '얼마나 심각한가요?'],
  ];

  // 보기 순서는 자료마다 섞되, 열 때마다 바뀌지 않게 고정한다.
  function helperOptions(field) {
    const id = myItemId();
    const seed = [...(id + field)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
    return seededShuffle(SUPPORT_CHOICES[id][field], seed);
  }

  function helperSentence(picks, blank) {
    const b = (v) => (v ? blank(v) : '<span class="blank">______</span>');
    return `${b(picks.where)}에서 ${b(picks.what)}. ${b(picks.how)}`;
  }

  function renderHelper() {
    const choices = helperChoices();
    if (!choices) {
      state.helper = null;
      setHtml(modalRoot, '');
      return;
    }
    const it = itemsById[myItemId()];
    const { step, picks } = state.helper;
    const [field, , question] = HELPER_STEPS[step];
    const tabs = HELPER_STEPS.map(([f, label], i) => `
      <button class="hstep ${i === step ? 'on' : ''} ${picks[f] ? 'done' : ''}" data-action="helper-step" data-step="${i}">
        <span>${picks[f] ? icon('check') : i + 1}</span>${label}
      </button>`).join('');
    const options = helperOptions(field).map((v) => `
      <button class="hchoice" data-action="helper-pick" data-value="${esc(v)}" aria-pressed="${picks[field] === v}">${esc(v)}</button>`).join('');
    const allPicked = HELPER_STEPS.every(([f]) => picks[f]);
    setHtml(modalRoot, `
      <div class="overlay" data-action="helper-close">
        <div class="modal helper-modal" role="dialog" aria-modal="true" aria-label="낱말 골라 문장 만들기">
          <button class="close" data-action="helper-close" aria-label="닫기">${icon('x')}</button>
          <aside class="hsource">
            <span class="kicker">자료 ${ITEM_NO[it.id]}</span>
            <h3>${esc(it.title)}</h3>
            <p>${esc(it.body)}</p>
          </aside>
          <section class="hmain">
          <div class="hsteps">${tabs}</div>
          <h2>${question}</h2>
          <p class="hhint">왼쪽 자료를 다시 읽고 알맞은 것을 골라요.</p>
          <div class="hchoices">${options}</div>
          <div class="hpreview">
            <span class="hpreview-label">만들어지는 문장</span>
            <p>${helperSentence(picks, (v) => `<b>${esc(v)}</b>`)}</p>
          </div>
          <div class="hactions">
            <button class="btn btn-ghost btn-large" data-action="helper-step" data-step="${Math.max(0, step - 1)}" ${step === 0 ? 'disabled' : ''}>${icon('arrowLeft')}이전</button>
            ${allPicked
              ? `<button class="btn btn-large" data-action="helper-insert">${icon('pencil')}보고서에 넣기</button>`
              : `<button class="btn btn-large" data-action="helper-step" data-step="${Math.min(2, step + 1)}" ${picks[field] ? '' : 'disabled'}>다음 ${icon('arrowRight')}</button>`}
          </div>
          </section>
        </div>
      </div>`);
  }

  function helperInsert() {
    const p = state.helper.picks;
    const sentence = `${p.where}에서 ${p.what}. ${p.how}`;
    const cur = currentText().trim();
    const text = !cur || cur === SENTENCE_FRAME.trim() ? sentence : `${cur} ${sentence}`;
    setDraft({ sid: myId(), itemId: myItemId(), text: text.slice(0, TEXT_MAX) });
    state.helper = null;
    render();
    toast('문장을 넣었어요. 읽어 보고 저장을 눌러요.');
  }

  // 직소 때 친구에게 보여 주는 전체 화면: 사진을 크게, 그 아래 내가 쓴 문장을 크게
  function renderExplain() {
    const it = itemsById[myItemId()];
    if (!it) {
      state.explain = false;
      setHtml(modalRoot, '');
      return;
    }
    const text = savedText(myId(), it.id);
    const group = groupsById[state.me.group];
    setHtml(modalRoot, `
      <div class="explain" role="dialog" aria-modal="true">
        <div class="explain-top">
          ${groupChip(group.id, `${group.name} ${state.me.num}번`)}
          <button class="btn btn-ghost explain-close" data-action="close-explain">${icon('x')}닫기</button>
        </div>
        <div class="explain-img"><img src="${esc(it.image)}" alt=""></div>
        <p class="explain-title">자료 ${ITEM_NO[it.id]} · ${esc(it.title)}</p>
        ${text ? `<p class="explain-text">${esc(text)}</p>` : '<p class="explain-text none">아직 정리를 저장하지 않았어요.</p>'}
      </div>`);
  }

  function renderDetail() {
    const id = state.openItemId;
    if (!id) {
      setHtml(modalRoot, '');
      return;
    }
    const it = itemsById[id];
    const mine = myItemId();
    const mateNum = mateNumFor(id);

    let actions;
    if (id === mine) {
      actions = `
        <span class="status mine">${icon('check')}내가 가져간 자료예요</span>
        <button class="btn btn-ghost-danger btn-large" data-action="release" ${state.busy ? 'disabled' : ''}>내려놓기</button>`;
    } else if (mateNum) {
      actions = `
        <span class="status mate">${icon('lock')}우리 모둠 ${mateNum}번이 이미 가져갔어요</span>
        <button class="btn btn-large" disabled>가져가기</button>`;
    } else {
      actions = `
        <span class="status">우리 모둠 주제에 맞는 자료인가요?</span>
        <button class="btn btn-large" data-action="claim" ${state.busy ? 'disabled' : ''}>${state.busy ? '가져가는 중…' : `가져가기 ${icon('arrowRight')}`}</button>`;
    }

    setHtml(modalRoot, `
      <div class="overlay" data-action="close">
        <div class="modal detail-modal" role="dialog" aria-modal="true" aria-label="${esc(it.title)}">
          <button class="close" data-action="close" aria-label="닫기">${icon('x')}</button>
          <div class="detail">
            <div class="detail-img"><img src="${esc(it.image)}" alt=""></div>
            <div class="content">
              <span class="kicker">자료 ${ITEM_NO[id]}</span>
              <h2>${esc(it.title)}</h2>
              <p class="body">${esc(it.body)}</p>
              ${metaHtml(it)}
              ${state.db.settings.linksOpen ? moreLink(it) : ''}
            </div>
          </div>
          <div class="actions">${actions}</div>
        </div>
      </div>`);
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
    renderOverlay();
    try {
      const res = await Store.claim(myId(), id);
      if (res.ok) {
        setDraft(null);
        state.justClaimed = id;
        state.openItemId = null;
        toast('자료를 수집했어요! 내 보고서에서 정리해 봐요.');
        setTimeout(() => { state.justClaimed = null; }, 1200);
      }
      else toast(`우리 모둠 ${parseStudentId(res.holder).num}번이 먼저 가져갔어요.`, 'error');
    } catch (e) {
      // 응답이 늦을 뿐 나중에 들어갈 수도 있으므로 '실패'라고 단정하지 않는다.
      toast('인터넷이 느려요. 잠시 뒤 카드에 도장이 찍히는지 보고, 안 찍히면 다시 눌러 주세요.', 'error');
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
    renderOverlay();
    try {
      await Store.release(myId());
      setDraft(null);
      toast('자료를 내려놓았어요.');
    } catch (e) {
      toast('저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.', 'error');
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
    const sending = Store.saveEntry(myId(), itemId, text);
    try {
      await withTimeout(sending, 8000);
      setDraft(null);
      state.savePending = false;
      celebrate('보고서를 저장했어요!', "활동 3에서 '설명 모드'로 친구에게 브리핑해요.");
    } catch (e) {
      if (e.message === 'timeout') {
        // 인터넷이 끊겼거나 느림: 이 기기에 줄 세워 두었다가 연결되면 저절로 보낸다.
        // 쓰던 글은 기기에 남겨 두어 화면을 닫았다 열어도 다시 저장할 수 있게 한다.
        state.savePending = true;
        toast('인터넷이 끊겨 있어요. 연결되면 자동으로 저장돼요. 화면을 닫지 마세요.', 'error');
        sending.then(() => {
          state.savePending = false;
          if (state.draft && state.draft.text === text) setDraft(null);
          toast('인터넷이 다시 연결되어 보고서를 저장했어요.');
          render();
        }).catch(() => {});
      } else if (e.message === 'not-claimed') {
        toast('가져간 자료가 바뀌었어요. 내 보고서를 다시 확인해 주세요.', 'error');
      } else {
        toast('저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.', 'error');
      }
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

  // 번호를 잘못 골랐을 때 고치는 기능. 잘못된 번호로 가져간 자료가 남아 진짜 그 번호 친구를
  // 헷갈리게 하지 않도록, 가져간 자료와 정리를 내려놓고 다시 고르게 한다.
  async function resetMe() {
    const holding = !!myItemId();
    const ok = await confirmBox(
      '모둠과 번호를 다시 고를까요?',
      holding ? '지금 가져간 자료와 쓴 정리는 내려놓아져요.' : '',
      '다시 고르기',
    );
    if (!ok) return;
    if (holding) {
      try {
        await Store.release(myId());
      } catch (e) {
        toast('인터넷이 느려요. 잠시 뒤 다시 눌러 주세요.', 'error');
        return;
      }
    }
    setDraft(null);
    Store.setPresence(null);
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
      case 'start': {
        const sid = makeStudentId(state.pick.group, state.pick.num);
        if (otherDeviceCount(sid) > 0) {
          toast('이 번호로 이미 접속한 친구가 있어요. 내 모둠과 번호를 다시 확인해 주세요.', 'error');
          render();
          break;
        }
        state.me = { ...state.pick };
        localStorage.setItem(ME_KEY, JSON.stringify(state.me));
        Store.setPresence(sid);
        render();
        break;
      }
      case 'reset-me':
        resetMe();
        break;
      case 'tab':
        state.tab = el.dataset.tab;
        render();
        break;
      case 'open':
        state.openItemId = el.dataset.item;
        renderOverlay();
        break;
      case 'close':
        state.openItemId = null;
        renderOverlay();
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
      case 'helper-open':
        state.helper = { step: 0, picks: {} };
        renderOverlay();
        break;
      case 'helper-close':
        if (el.classList.contains('overlay') && e.target !== el) return;
        state.helper = null;
        renderOverlay();
        break;
      case 'helper-step':
        state.helper.step = Number(el.dataset.step);
        renderOverlay();
        break;
      case 'helper-pick': {
        const [field] = HELPER_STEPS[state.helper.step];
        state.helper.picks[field] = el.dataset.value;
        if (state.helper.step < HELPER_STEPS.length - 1) state.helper.step += 1;
        renderOverlay();
        break;
      }
      case 'helper-insert':
        helperInsert();
        break;
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id !== 'entry-text') return;
    setDraft({ sid: myId(), itemId: myItemId(), text: e.target.value });
    updateSaveBar();
  });

  // 한글을 조합하는 동안(ㅂ→바→받)은 화면을 다시 그리지 않고, 조합이 끝나면 밀린 것을 그린다.
  document.addEventListener('compositionstart', (e) => {
    if (e.target.id === 'entry-text') state.composing = true;
  });
  document.addEventListener('compositionend', (e) => {
    if (e.target.id !== 'entry-text') return;
    state.composing = false;
    setTimeout(() => { if (state.pendingRender && !state.composing) render(); }, 0);
  });
  document.addEventListener('focusout', (e) => {
    if (e.target.id === 'entry-text' && state.composing) {
      state.composing = false;
      setTimeout(() => { if (state.pendingRender) render(); }, 0);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.explain) {
      closeExplain();
      return;
    }
    if (e.key === 'Escape' && state.helper) {
      state.helper = null;
      renderOverlay();
      return;
    }
    if (e.key === 'Escape' && state.openItemId && !document.querySelector('.confirm')) {
      state.openItemId = null;
      renderOverlay();
    }
  });

  // 전체 화면을 Esc 등으로 빠져나오면 설명 모드도 닫는다.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && state.explain) closeExplain();
  });

  // 연결이 3초 넘게 끊겨 있을 때만 알림 띠를 보여 준다(처음 연결 중에는 숨김).
  const offlineEl = document.getElementById('offline');
  let offlineTimer = null;
  let everConnected = false;
  Store.onConnection((connected) => {
    clearTimeout(offlineTimer);
    if (connected) {
      everConnected = true;
      offlineEl.hidden = true;
    } else {
      offlineTimer = setTimeout(() => {
        offlineEl.textContent = everConnected
          ? '인터넷 연결이 끊겼어요. 잠시 기다리거나 선생님께 알려 주세요.'
          : '수업 서버에 연결하지 못했어요. 와이파이를 확인하고, 계속 안 되면 선생님께 알려 주세요.';
        offlineEl.hidden = false;
      }, everConnected ? 3000 : 6000);
    }
  });

  if (state.me) Store.setPresence(myId());
  render();   // 서버 연결 전에도 입장 화면은 바로 보이게 한다

  Store.subscribe((db) => {
    state.db = db;
    state.loaded = true;
    render();
  });
})();
