// 교사 화면
(() => {
  const AUTH_KEY = 'gi-teacher';
  const itemsById = Object.fromEntries(ITEMS.map((it) => [it.id, it]));
  const groupsById = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
  const NUMS = Array.from({ length: MEMBERS_PER_GROUP }, (_, i) => i + 1);
  const TOTAL = GROUPS.length * MEMBERS_PER_GROUP;

  // 칠판 모드 단계. 학생이 봐도 되는 내용만 나온다(이름, 주제 분류 없음).
  const BOARD_STAGES = [
    { id: 'question',  label: '탐구 질문' },
    { id: 'act1',      label: '활동1', timer: true },
    { id: 'act2',      label: '활동2', timer: true },
    { id: 'act3',      label: '활동3', timer: true },
    { id: 'overlap',   label: '정리① 겹친 자료' },
    { id: 'remaining', label: '정리② 남은 자료' },
  ];

  const state = {
    authed: sessionStorage.getItem(AUTH_KEY) === 'ok',
    view: 'status',            // 'status' | 'overlap' | 'remaining' | 'settings'
    showRemaining: false,      // 남은 자료는 버튼을 눌렀을 때만 보여 준다
    openItemId: null,          // 남은 자료 상세
    board: null,               // 칠판 모드 단계 번호, 꺼져 있으면 null
    boardReveal: false,        // 칠판 모드 남은 자료 공개 여부
    timer: { duration: 300, left: 300, running: false, endAt: 0 },
    db: { claims: {}, entries: {}, settings: {} },
  };

  const app = document.getElementById('app');
  const modalRoot = document.getElementById('modal-root');

  // ---------- 계산 ----------
  function allStudentIds() {
    return GROUPS.flatMap((g) => NUMS.map((n) => makeStudentId(g.id, n)));
  }

  function studentLabel(sid) {
    const { group, num } = parseStudentId(sid);
    return `${groupsById[group].name} ${num}번`;
  }

  function claimOf(sid) {
    const id = state.db.claims[sid];
    return itemsById[id] ? id : null;
  }

  function entryOf(sid) {
    const entry = state.db.entries[sid];
    return entry && entry.itemId === claimOf(sid) && entry.text ? entry : null;
  }

  function counts() {
    const ids = allStudentIds();
    return {
      claimed: ids.filter(claimOf).length,
      written: ids.filter(entryOf).length,
    };
  }

  // 피드백이 필요한 학생: 해결 노력 자료를 가져갔거나, 자기 모둠 주제가 topics에 없는 자료를 가져감
  function checkReason(sid) {
    const itemId = claimOf(sid);
    if (!itemId) return null;
    if (itemsById[itemId].type === 'effort') return '해결 노력 자료';
    const topics = ITEM_TOPICS[itemId] || [];
    if (!topics.includes(parseStudentId(sid).group)) return '모둠 주제와 다른 자료';
    return null;
  }

  // 두 모둠 이상이 가져간 자료: [{ item, groups: [groupId...] }]
  function overlaps() {
    const byItem = {};
    for (const sid of allStudentIds()) {
      const itemId = claimOf(sid);
      if (!itemId) continue;
      (byItem[itemId] ||= new Set()).add(parseStudentId(sid).group);
    }
    return Object.entries(byItem)
      .filter(([, set]) => set.size >= 2)
      .map(([itemId, set]) => ({
        item: itemsById[itemId],
        groups: GROUPS.map((g) => g.id).filter((g) => set.has(g)),
      }));
  }

  function remainingItems() {
    const taken = new Set(allStudentIds().map(claimOf).filter(Boolean));
    return ITEMS.filter((it) => !taken.has(it.id));
  }

  // data.js와 teacher-data.js가 서로 맞는지 점검
  function dataProblems() {
    const out = [];
    for (const it of ITEMS) {
      const topics = ITEM_TOPICS[it.id];
      if (!topics) out.push(`'${it.title}' (${it.id}): teacher-data.js에 분류가 없어요.`);
      else if (it.type === 'problem' && topics.length === 0) out.push(`'${it.title}' (${it.id}): 문제 자료인데 주제가 비어 있어요.`);
      else if (it.type === 'effort' && topics.length > 0) out.push(`'${it.title}' (${it.id}): 해결 노력 자료인데 주제가 들어 있어요.`);
    }
    for (const g of GROUPS) {
      const n = ITEMS.filter((it) => (ITEM_TOPICS[it.id] || []).includes(g.id)).length;
      if (n < MEMBERS_PER_GROUP) out.push(`${g.name}: 해당 자료가 ${n}개뿐이에요. 모둠원 수(${MEMBERS_PER_GROUP}명)보다 적어요.`);
    }
    return out;
  }

  // ---------- 그리기 ----------
  function render() {
    if (!state.authed) {
      renderPin();
      return;
    }
    if (state.board !== null) {
      renderBoard();
      return;
    }
    renderDashboard();
    renderItemModal();
  }

  function renderPin() {
    app.innerHTML = `
      <form class="pin" data-form="pin">
        <h1>교사 화면</h1>
        <p class="lead">PIN을 입력하세요.</p>
        <input id="pin" type="password" inputmode="numeric" autocomplete="off" autofocus>
        <button class="btn btn-large" type="submit">들어가기</button>
      </form>`;
    document.getElementById('pin').focus();
  }

  function renderDashboard() {
    const c = counts();
    const friendsOpen = !!state.db.settings.friendsOpen;
    const checks = allStudentIds().filter(checkReason).length;
    const nav = [
      ['status', `현황판${checks ? ` <span class="pill warn">${checks}</span>` : ''}`],
      ['overlap', '겹친 자료'],
      ['remaining', '남은 자료'],
      ['settings', '설정 · 초기화'],
    ].map(([id, label]) => `
      <button class="tab" data-action="view" data-view="${id}" aria-selected="${state.view === id}">${label}</button>`).join('');

    let content;
    if (state.view === 'status') content = renderStatus();
    else if (state.view === 'overlap') content = renderOverlapView();
    else if (state.view === 'remaining') content = renderRemainingView();
    else content = renderSettings();

    app.innerHTML = `
      <header class="topbar">
        <div class="topbar-inner">
          <span class="brand">🌏 교사 화면</span>
          ${Store.mode === 'local' ? '<span class="mode-note">시험 모드: 이 브라우저에만 저장돼요</span>' : ''}
          <span class="summary">가져감 <b>${c.claimed}</b>/${TOTAL} · 정리 <b>${c.written}</b>/${TOTAL}</span>
          <button class="btn ${friendsOpen ? 'btn-on' : 'btn-ghost'}" data-action="toggle-friends">
            친구 카드 ${friendsOpen ? '열림 🔓' : '닫힘 🔒'}
          </button>
          <button class="btn" data-action="board-open">칠판 모드 ▶</button>
        </div>
        <nav class="tabs">${nav}</nav>
      </header>
      <main>${content}</main>`;
  }

  function renderStatus() {
    const head = NUMS.map((n) => `<th>${n}번</th>`).join('');
    const rows = GROUPS.map((g) => {
      const cells = NUMS.map((n) => {
        const sid = makeStudentId(g.id, n);
        const itemId = claimOf(sid);
        const entry = entryOf(sid);
        const reason = checkReason(sid);
        if (!itemId) {
          return `<td class="cell no-claim"><span class="state">자료 없음</span></td>`;
        }
        return `
          <td class="cell ${entry ? 'done' : 'no-entry'} ${reason ? 'check' : ''}">
            ${reason ? `<span class="flag">⚠ ${reason}</span>` : ''}
            <span class="item">${esc(itemsById[itemId].title)}</span>
            ${entry
              ? `<span class="text">${esc(entry.text)}</span>`
              : '<span class="state">정리 전</span>'}
          </td>`;
      }).join('');
      return `<tr><th class="gname">${esc(g.name)}</th>${cells}</tr>`;
    }).join('');

    const checkList = allStudentIds()
      .map((sid) => ({ sid, reason: checkReason(sid) }))
      .filter((x) => x.reason)
      .map(({ sid, reason }) => `
        <li>
          <b>${esc(studentLabel(sid))}</b>
          <span>${esc(itemsById[claimOf(sid)].title)}</span>
          <span class="pill warn">${reason}</span>
        </li>`).join('');

    return `
      <div class="status-layout">
        <section>
          <table class="board-table">
            <thead><tr><th></th>${head}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <p class="legend">
            <span class="sw no-claim"></span>자료 없음
            <span class="sw no-entry"></span>정리 전
            <span class="sw done"></span>정리 완료
            <span class="sw check"></span>확인 필요
          </p>
        </section>
        <aside class="checks">
          <h2>확인 필요 <small>교사만 보세요</small></h2>
          ${checkList ? `<ul>${checkList}</ul>` : '<p class="muted">지금은 없어요.</p>'}
        </aside>
      </div>`;
  }

  function itemCard(it, extra = '', clickable = false) {
    const tag = clickable ? 'button' : 'div';
    const attrs = clickable ? `data-action="open-item" data-item="${it.id}"` : '';
    return `
      <${tag} class="big-card" ${attrs}>
        <img src="${esc(it.image)}" alt="" loading="lazy">
        <div class="big-card-body">
          <h3>${esc(it.title)}</h3>
          ${extra}
        </div>
      </${tag}>`;
  }

  function overlapCards() {
    const list = overlaps();
    if (!list.length) return '<p class="empty">아직 두 모둠 이상이 함께 가져간 자료가 없어요.</p>';
    return `<div class="big-grid">${list.map(({ item, groups }) => itemCard(item, `
      <div class="chips">${groups.map((g) => `<span class="chip">${esc(groupsById[g].name)}</span>`).join('')}</div>`)).join('')}</div>`;
  }

  function remainingCards() {
    const list = remainingItems();
    if (!list.length) return '<p class="empty">남은 자료가 없어요. 모든 자료를 누군가 가져갔어요.</p>';
    return `<div class="big-grid">${list.map((it) => itemCard(it, '', true)).join('')}</div>`;
  }

  function renderOverlapView() {
    return `
      <h2 class="view-title">두 모둠 이상이 가져간 자료</h2>
      <p class="hint">정리 때 전자칠판에 띄워 "왜 여러 모둠이 같은 자료를 골랐을까요?"를 물어보세요.</p>
      ${overlapCards()}`;
  }

  function renderRemainingView() {
    const n = remainingItems().length;
    if (!state.showRemaining) {
      return `
        <div class="reveal">
          <p>아무도 가져가지 않은 자료가 <b>${n}개</b> 있어요.</p>
          <button class="btn btn-large" data-action="show-remaining">남은 자료 보기</button>
        </div>`;
    }
    return `
      <h2 class="view-title">아무도 가져가지 않은 자료 <button class="btn btn-ghost" data-action="hide-remaining">숨기기</button></h2>
      <p class="hint">카드를 누르면 본문이 크게 열려요.</p>
      ${remainingCards()}`;
  }

  function renderSettings() {
    const problems = dataProblems();
    const studentUrl = new URL('./', location.href).href;
    return `
      <div class="settings">
        <section>
          <h2>학생 화면 주소</h2>
          <p class="url">${esc(studentUrl)}</p>
        </section>
        <section>
          <h2>자료 점검</h2>
          ${problems.length
            ? `<ul class="problems">${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
            : `<p class="muted">자료 ${ITEMS.length}개, 분류에 문제가 없어요.</p>`}
        </section>
        <section class="danger-zone">
          <h2>초기화</h2>
          <p>모든 학생의 가져간 자료와 정리를 지우고 친구 카드를 닫아요. 리허설 뒤나 다른 반 수업 전에 쓰세요.</p>
          <button class="btn btn-danger btn-large" data-action="reset">전체 초기화</button>
        </section>
      </div>`;
  }

  function renderItemModal() {
    const it = itemsById[state.openItemId];
    if (!it) {
      modalRoot.innerHTML = '';
      return;
    }
    modalRoot.innerHTML = `
      <div class="overlay" data-action="close-item">
        <div class="modal" role="dialog" aria-modal="true">
          <button class="close" data-action="close-item" aria-label="닫기">✕</button>
          <div class="detail">
            <img src="${esc(it.image)}" alt="">
            <div class="content">
              <h2>${esc(it.title)}</h2>
              <p class="body">${esc(it.body)}</p>
              <p class="meta">출처: ${esc(it.source)} · ${esc(it.date)}</p>
            </div>
          </div>
        </div>
      </div>`;
  }

  // ---------- 칠판 모드 ----------
  function renderBoard() {
    const stage = BOARD_STAGES[state.board];
    const c = counts();
    let body = '';

    if (stage.id === 'question') {
      body = `
        <p class="b-kicker">탐구 질문</p>
        <h1 class="b-question">지구촌을 위협하는 문제에는<br>어떤 것들이 있을까요?</h1>
        <div class="b-groups">${GROUPS.map((g) => `<span>${esc(g.name)}</span>`).join('')}</div>`;
    } else if (stage.id === 'act1') {
      body = `
        <p class="b-kicker">활동 1</p>
        <h1>우리 모둠 주제에 맞는 자료 찾기</h1>
        <ol class="b-steps">
          <li>'자료 모음'에서 카드를 눌러 자료를 읽어요.</li>
          <li>우리 모둠 주제에 해당하는 자료를 <b>한 사람이 하나씩</b> 가져가요.</li>
          <li>우리 모둠 친구가 이미 가져간 자료는 가져갈 수 없어요.</li>
        </ol>
        ${progress('자료를 가져간 사람', c.claimed)}`;
    } else if (stage.id === 'act2') {
      body = `
        <p class="b-kicker">활동 2</p>
        <h1>문제 상황과 심각성 정리하기</h1>
        <ol class="b-steps">
          <li>'내 카드'에서 자료를 다시 읽어요.</li>
          <li><b>어디에서 어떤 문제</b>가 일어나는지, <b>얼마나 심각한지</b> 1~2문장으로 써요.</li>
          <li>다 쓰면 <b>저장</b>을 눌러요.</li>
        </ol>
        <p class="b-example">예) ○○에서 ○○ 문제가 일어나고 있습니다. ○○할 만큼 심각합니다.</p>
        ${progress('정리를 저장한 사람', c.written)}`;
    } else if (stage.id === 'act3') {
      const teams = NUMS.map((n) => `
        <div class="b-team">
          <h3>${n}번 모둠</h3>
          <ul>${GROUPS.map((g) => `<li>${esc(g.name)} ${n}번</li>`).join('')}</ul>
        </div>`).join('');
      body = `
        <p class="b-kicker">활동 3</p>
        <h1>같은 번호끼리 모여 설명하기</h1>
        <div class="b-teams">${teams}</div>
        <ol class="b-steps compact">
          <li>'내 카드'에서 <b>설명 모드</b>를 켜고 친구에게 보여 주며 설명해요.</li>
          <li>친구의 설명을 듣고 정리표를 채워요.</li>
        </ol>`;
    } else if (stage.id === 'overlap') {
      body = `
        <p class="b-kicker">정리</p>
        <h1>여러 모둠이 함께 고른 자료</h1>
        <p class="b-sub">왜 여러 모둠이 같은 자료를 골랐을까요?</p>
        ${overlapCards()}`;
    } else if (stage.id === 'remaining') {
      body = `
        <p class="b-kicker">정리</p>
        <h1>아무도 가져가지 않은 자료</h1>
        ${state.boardReveal
          ? `${remainingCards()}<p class="b-next">다음 시간에는 지구촌 문제를 해결하기 위한 노력을 알아봅시다.</p>`
          : `<div class="reveal"><button class="btn btn-large" data-action="board-reveal">남은 자료 보기</button></div>`}`;
    }

    const dots = BOARD_STAGES.map((s, i) => `
      <button class="b-dot" data-action="board-go" data-stage="${i}" aria-current="${i === state.board}">${s.label}</button>`).join('');

    app.innerHTML = `
      <div class="b-screen">
        ${stage.timer ? timerHtml() : ''}
        <div class="b-body">${body}</div>
        <nav class="b-nav">
          <button class="btn btn-ghost" data-action="board-prev" ${state.board === 0 ? 'disabled' : ''}>◀ 이전</button>
          <div class="b-dots">${dots}</div>
          <button class="btn btn-ghost" data-action="board-next" ${state.board === BOARD_STAGES.length - 1 ? 'disabled' : ''}>다음 ▶</button>
          <button class="btn btn-ghost b-exit" data-action="board-exit">나가기</button>
        </nav>
      </div>`;
    renderItemModal();
  }

  function progress(label, n) {
    const pct = Math.round((n / TOTAL) * 100);
    return `
      <div class="b-progress">
        <div class="b-progress-label">${label} <b>${n}</b> / ${TOTAL}</div>
        <div class="b-bar"><span style="width:${pct}%"></span></div>
      </div>`;
  }

  // ---------- 타이머 (칠판 모드 활동 단계) ----------
  function timerLeft() {
    const t = state.timer;
    return t.running ? Math.max(0, Math.round((t.endAt - Date.now()) / 1000)) : t.left;
  }

  function fmt(sec) {
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }

  function timerHtml() {
    const left = timerLeft();
    const presets = [3, 5, 7, 10].map((m) => `<button data-action="timer-set" data-min="${m}">${m}분</button>`).join('');
    return `
      <div class="b-timer ${left === 0 ? 'ended' : ''}">
        <div id="timer-display" class="t-display">${left === 0 ? '시간 끝!' : fmt(left)}</div>
        <div class="t-controls">
          ${presets}
          <button data-action="timer-toggle">${state.timer.running ? '⏸' : '▶'}</button>
          <button data-action="timer-reset">↺</button>
        </div>
      </div>`;
  }

  setInterval(() => {
    const t = state.timer;
    if (!t.running) return;
    const left = timerLeft();
    if (left === 0) {
      t.running = false;
      t.left = 0;
      if (state.board !== null) render();
      return;
    }
    const el = document.getElementById('timer-display');
    if (el) el.textContent = fmt(left);
  }, 250);

  // ---------- 동작 ----------
  async function toggleFriends() {
    const next = !state.db.settings.friendsOpen;
    try {
      await Store.setSetting('friendsOpen', next);
      toast(next ? '학생 화면에서 친구 카드가 열렸어요.' : '친구 카드를 닫았어요.');
    } catch (e) {
      toast('바꾸지 못했어요. 인터넷 연결을 확인해 주세요.');
    }
  }

  async function resetAll() {
    const ok1 = await confirmBox('모든 학생의 자료와 정리를 지울까요?', '지운 내용은 되돌릴 수 없어요.', '지우기', 'btn btn-danger');
    if (!ok1) return;
    const ok2 = await confirmBox('정말 전체 초기화할까요?', '마지막 확인이에요.', '전체 초기화', 'btn btn-danger');
    if (!ok2) return;
    try {
      await Store.resetAll();
      state.showRemaining = false;
      state.boardReveal = false;
      toast('초기화했어요.');
    } catch (e) {
      toast('초기화하지 못했어요. 인터넷 연결을 확인해 주세요.');
    }
  }

  function boardGo(i) {
    state.board = Math.max(0, Math.min(BOARD_STAGES.length - 1, i));
    render();
  }

  app.addEventListener('submit', (e) => {
    if (e.target.dataset.form !== 'pin') return;
    e.preventDefault();
    const input = document.getElementById('pin');
    if (input.value === TEACHER_PIN) {
      sessionStorage.setItem(AUTH_KEY, 'ok');
      state.authed = true;
      render();
    } else {
      input.value = '';
      toast('PIN이 맞지 않아요.');
    }
  });

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'close-item' && el.classList.contains('overlay') && e.target !== el) return;

    switch (action) {
      case 'view':
        state.view = el.dataset.view;
        render();
        break;
      case 'toggle-friends':
        toggleFriends();
        break;
      case 'show-remaining':
        state.showRemaining = true;
        render();
        break;
      case 'hide-remaining':
        state.showRemaining = false;
        render();
        break;
      case 'open-item':
        state.openItemId = el.dataset.item;
        renderItemModal();
        break;
      case 'close-item':
        state.openItemId = null;
        renderItemModal();
        break;
      case 'reset':
        resetAll();
        break;
      case 'board-open':
        state.board = 0;
        document.documentElement.requestFullscreen?.().catch(() => {});
        render();
        break;
      case 'board-exit':
        state.board = null;
        state.openItemId = null;
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        render();
        break;
      case 'board-prev':
        boardGo(state.board - 1);
        break;
      case 'board-next':
        boardGo(state.board + 1);
        break;
      case 'board-go':
        boardGo(Number(el.dataset.stage));
        break;
      case 'board-reveal':
        state.boardReveal = true;
        render();
        break;
      case 'timer-set':
        state.timer = { duration: Number(el.dataset.min) * 60, left: Number(el.dataset.min) * 60, running: false, endAt: 0 };
        render();
        break;
      case 'timer-toggle': {
        const t = state.timer;
        if (t.running) {
          t.left = timerLeft();
          t.running = false;
        } else {
          if (t.left === 0) t.left = t.duration;
          t.endAt = Date.now() + t.left * 1000;
          t.running = true;
        }
        render();
        break;
      }
      case 'timer-reset':
        state.timer = { ...state.timer, left: state.timer.duration, running: false };
        render();
        break;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.openItemId) {
      state.openItemId = null;
      renderItemModal();
      return;
    }
    if (state.board === null || state.openItemId) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') boardGo(state.board + 1);
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') boardGo(state.board - 1);
  });

  const offlineEl = document.getElementById('offline');
  let offlineTimer = null;
  Store.onConnection((connected) => {
    clearTimeout(offlineTimer);
    if (connected) offlineEl.hidden = true;
    else offlineTimer = setTimeout(() => { offlineEl.hidden = false; }, 3000);
  });

  Store.subscribe((db) => {
    state.db = db;
    if (state.authed) render();   // PIN 입력 중에는 다시 그리지 않는다
  });
  render();
})();
