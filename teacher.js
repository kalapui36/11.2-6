// 교사 화면
(() => {
  const AUTH_KEY = 'gi-teacher';
  const itemsById = Object.fromEntries(ITEMS.map((it) => [it.id, it]));
  const groupsById = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
  const NUMS = Array.from({ length: MEMBERS_PER_GROUP }, (_, i) => i + 1);
  const TOTAL = GROUPS.length * MEMBERS_PER_GROUP;

  // 칠판 모드 단계. 학생이 봐도 되는 내용만 나온다(이름, 주제 분류 없음).
  // 수업 지도안 흐름. minutes가 있는 단계는 타이머가 그 시간으로 맞춰진다.
  const BOARD_STAGES = [
    { id: 'motivation', label: '동기 유발' },
    { id: 'question',   label: '탐구 질문' },
    { id: 'activities', label: '활동 안내' },
    { id: 'act1',       label: '활동1', minutes: 10 },
    { id: 'act2',       label: '활동2', minutes: 5 },
    { id: 'act3',       label: '활동3', minutes: 15 },
    { id: 'overlap',    label: '정리①' },
    { id: 'summary',    label: '정리②' },
    { id: 'postit',     label: '정리③', minutes: 3 },
    { id: 'preview',    label: '차시 예고' },
  ];

  const state = {
    authed: sessionStorage.getItem(AUTH_KEY) === 'ok',
    view: 'status',            // 'status' | 'overlap' | 'remaining' | 'settings'
    showRemaining: false,      // 남은 자료는 버튼을 눌렀을 때만 보여 준다
    openItemId: null,          // 남은 자료 상세
    openStudent: null,         // 현황판에서 누른 학생(쓰기 도움 켜기/끄기)
    board: null,               // 칠판 모드 단계 번호, 꺼져 있으면 null
    boardReveal: false,        // 칠판 모드 남은 자료 공개 여부
    timer: { stageId: null, duration: 0, left: 0, running: false, endAt: 0 },
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

  // 쓰기 도움 학생 목록. /settings/supportIds에 'climate-2,refugee-3'처럼 글자로 저장한다.
  function supportIds() {
    return String(state.db.settings.supportIds || '').split(',').filter(Boolean);
  }

  function isSupport(sid) {
    return supportIds().includes(sid) || SUPPORT_STUDENTS.includes(sid);
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
      <div class="pin-wrap">
        <form class="pin" data-form="pin">
          <div class="brand-mark">${icon('lock')}</div>
          <h1>교사 화면</h1>
          <p class="lead">지구촌 탐사대 · 교사용</p>
          <input id="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN" autofocus>
          <button class="btn btn-large btn-block" type="submit">들어가기 ${icon('arrowRight')}</button>
        </form>
      </div>`;
    document.getElementById('pin').focus();
  }

  function renderDashboard() {
    const c = counts();
    const friendsOpen = !!state.db.settings.friendsOpen;
    const linksOpen = !!state.db.settings.linksOpen;
    const checks = allStudentIds().filter(checkReason).length;
    const nav = [
      ['status', 'grid', `현황판${checks ? ` <span class="pill warn">${checks}</span>` : ''}`],
      ['overlap', 'link', '겹친 자료'],
      ['remaining', 'eye', '남은 자료'],
      ['settings', 'gear', '설정 · 초기화'],
    ].map(([id, ic, label]) => `
      <button class="tab" data-action="view" data-view="${id}" aria-selected="${state.view === id}">${icon(ic)}<span>${label}</span></button>`).join('');

    let content;
    if (state.view === 'status') content = renderStatus();
    else if (state.view === 'overlap') content = renderOverlapView();
    else if (state.view === 'remaining') content = renderRemainingView();
    else content = renderSettings();

    app.innerHTML = `
      <header class="topbar">
        <div class="topbar-inner">
          <div class="brand">
            <span class="brand-mark sm">${icon('globe')}</span>
            <span class="brand-text">
              <strong>지구촌 탐사대 · 교사 화면</strong>
              <small>현황을 확인하고 칠판 화면을 띄워요</small>
            </span>
          </div>
          ${Store.mode === 'local' ? '<span class="mode-note">시험 모드 · 이 브라우저에만 저장</span>' : ''}
          <div class="summary">
            <span class="stat"><small>가져감</small><b>${c.claimed}</b>/${TOTAL}</span>
            <span class="stat"><small>정리</small><b>${c.written}</b>/${TOTAL}</span>
          </div>
          <button class="switch ${friendsOpen ? 'on' : ''}" data-action="toggle-friends" aria-pressed="${friendsOpen}">
            ${icon(friendsOpen ? 'unlock' : 'lock')}<span>친구 보고서 ${friendsOpen ? '열림' : '닫힘'}</span><i></i>
          </button>
          <button class="switch ${linksOpen ? 'on' : ''}" data-action="toggle-links" aria-pressed="${linksOpen}">
            ${icon('link')}<span>관련 자료 링크 ${linksOpen ? '보임' : '숨김'}</span><i></i>
          </button>
          <button class="btn btn-sun" data-action="board-open">${icon('board')}칠판 모드</button>
        </div>
        <nav class="tabs">${nav}</nav>
      </header>
      <main class="${state.view === 'status' ? 'fit' : ''}">${content}</main>`;
  }

  function renderStatus() {
    const head = NUMS.map((n) => `<th>${n}번</th>`).join('');
    const rows = GROUPS.map((g) => {
      const cells = NUMS.map((n) => {
        const sid = makeStudentId(g.id, n);
        const itemId = claimOf(sid);
        const entry = entryOf(sid);
        const reason = checkReason(sid);
        const sup = isSupport(sid) ? `<span class="sup-mark" title="쓰기 도움">${icon('sparkle')}</span>` : '';
        if (!itemId) {
          return `<td class="cell no-claim" data-action="open-student" data-sid="${sid}">${sup}<span class="state">자료 없음</span></td>`;
        }
        return `
          <td class="cell ${entry ? 'done' : 'no-entry'} ${reason ? 'check' : ''}" data-action="open-student" data-sid="${sid}">
            ${sup}
            ${reason ? `<span class="flag">${icon('alert')}${reason}</span>` : ''}
            <span class="item"><em>${ITEM_NO[itemId]}</em>${esc(itemsById[itemId].title)}</span>
            ${entry
              ? `<span class="text">${esc(entry.text)}</span>`
              : '<span class="state">정리 전</span>'}
          </td>`;
      }).join('');
      const st = GROUP_STYLE[g.id];
      return `<tr><th class="gname" style="--g:${st.color};--gs:${st.soft}">${emblem(g.id, 'gname-emblem')}${esc(g.name)}</th>${cells}</tr>`;
    }).join('');

    const checkList = allStudentIds()
      .map((sid) => ({ sid, reason: checkReason(sid) }))
      .filter((x) => x.reason)
      .map(({ sid, reason }) => `
        <li>
          <b>${esc(studentLabel(sid))}</b>
          <span>자료 ${ITEM_NO[claimOf(sid)]} · ${esc(itemsById[claimOf(sid)].title)}</span>
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
            <span class="legend-sup">${icon('sparkle')}쓰기 도움</span>
            <span class="legend-tip">칸을 누르면 정리 전체 보기 · 쓰기 도움 켜기</span>
          </p>
        </section>
        <aside class="checks">
          <h2>${icon('alert')}확인 필요 <small>교사만 보세요</small></h2>
          ${checkList ? `<ul>${checkList}</ul>` : '<p class="muted">지금은 없어요.</p>'}
        </aside>
      </div>`;
  }

  function itemCard(it, extra = '', clickable = false) {
    const tag = clickable ? 'button' : 'div';
    const attrs = clickable ? `data-action="open-item" data-item="${it.id}"` : '';
    return `
      <${tag} class="big-card" ${attrs}>
        <span class="big-card-img">
          <img src="${esc(it.image)}" alt="" loading="lazy">
          <span class="card-no">자료 ${ITEM_NO[it.id]}</span>
        </span>
        <div class="big-card-body">
          <h3>${esc(it.title)}</h3>
          ${extra}
        </div>
      </${tag}>`;
  }

  function overlapCards() {
    const list = overlaps();
    if (!list.length) return `<div class="empty"><div class="empty-icon">${icon('link')}</div><p>아직 두 모둠 이상이 함께 가져간 자료가 없어요.</p></div>`;
    return `<div class="big-grid">${list.map(({ item, groups }) => itemCard(item, `
      <div class="chips">${groups.map((g) => groupChip(g, groupsById[g].name)).join('')}</div>`)).join('')}</div>`;
  }

  function remainingCards() {
    const list = remainingItems();
    if (!list.length) return `<div class="empty"><div class="empty-icon">${icon('check')}</div><p>남은 자료가 없어요. 모든 자료를 누군가 가져갔어요.</p></div>`;
    return `<div class="big-grid">${list.map((it) => itemCard(it, '', true)).join('')}</div>`;
  }

  function renderOverlapView() {
    return `
      <div class="page-head"><div><h1>두 모둠 이상이 가져간 자료</h1>
      <p>정리 때 전자칠판에 띄워 "왜 여러 모둠이 같은 자료를 골랐을까요?"를 물어보세요.</p></div></div>
      ${overlapCards()}`;
  }

  function renderRemainingView() {
    const n = remainingItems().length;
    if (!state.showRemaining) {
      return `
        <div class="empty">
          <div class="empty-icon">${icon('eye')}</div>
          <h2>아무도 가져가지 않은 자료 ${n}개</h2>
          <p>차시 예고 때 버튼을 눌러 공개하세요.</p>
          <button class="btn btn-large" data-action="show-remaining">${icon('eye')}남은 자료 보기</button>
        </div>`;
    }
    return `
      <div class="page-head"><div><h1>아무도 가져가지 않은 자료</h1>
      <p>카드를 누르면 본문이 크게 열려요.</p></div>
      <button class="btn btn-ghost head-action" data-action="hide-remaining">숨기기</button></div>
      ${remainingCards()}`;
  }

  function renderSettings() {
    const problems = dataProblems();
    const studentUrl = new URL('./', location.href).href;
    return `
      <div class="settings">
        <section>
          <h2>${icon('link')}학생 화면 주소</h2>
          <p class="url">${esc(studentUrl)}</p>
        </section>
        <section>
          <h2>${icon('print')}활동지 인쇄</h2>
          <p class="muted">A4 한 장. 새 창에서 열고 '인쇄하기'를 눌러요.</p>
          <div class="ws-links">
            <a class="btn" href="worksheet.html" target="_blank" rel="noopener">${icon('print')}일반용</a>
            <a class="btn btn-ghost" href="worksheet.html?type=support" target="_blank" rel="noopener">${icon('sparkle')}쓰기 도움용(문장 틀)</a>
          </div>
        </section>
        <section>
          <h2>${icon('check')}자료 점검</h2>
          ${problems.length
            ? `<ul class="problems">${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
            : `<p class="muted">자료 ${ITEMS.length}개, 분류에 문제가 없어요.</p>`}
        </section>
        <section class="danger-zone">
          <h2>${icon('trash')}초기화</h2>
          <p>모든 학생의 가져간 자료와 정리를 지우고 친구 보고서와 관련 자료 링크를 닫아요. 리허설 뒤나 다른 반 수업 전에 쓰세요. 쓰기 도움 지정은 그대로 남아요.</p>
          <button class="btn btn-danger btn-large" data-action="reset">전체 초기화</button>
        </section>
      </div>`;
  }

  function renderItemModal() {
    if (state.openStudent) {
      renderStudentModal();
      return;
    }
    const it = itemsById[state.openItemId];
    if (!it) {
      modalRoot.innerHTML = '';
      return;
    }
    modalRoot.innerHTML = `
      <div class="overlay" data-action="close-item">
        <div class="modal detail-modal" role="dialog" aria-modal="true">
          <button class="close" data-action="close-item" aria-label="닫기">${icon('x')}</button>
          <div class="detail">
            <div class="detail-img"><img src="${esc(it.image)}" alt=""></div>
            <div class="content">
              <span class="kicker">자료 ${ITEM_NO[it.id]}</span>
              <h2>${esc(it.title)}</h2>
              <p class="body">${esc(it.body)}</p>
              <div class="meta"><span>${icon('source')}${esc(it.source)}</span><span>${icon('calendar')}${esc(it.date)}</span></div>
              ${it.imageCredit ? `<p class="photo-credit">사진: ${esc(it.imageCredit)}</p>` : ''}
              ${moreLink(it)}
            </div>
          </div>
        </div>
      </div>`;
  }

  // 현황판에서 학생 칸을 눌렀을 때: 정리 전체와 쓰기 도움 스위치
  function renderStudentModal() {
    const sid = state.openStudent;
    const itemId = claimOf(sid);
    const it = itemId ? itemsById[itemId] : null;
    const entry = entryOf(sid);
    const on = isSupport(sid);
    const fixed = SUPPORT_STUDENTS.includes(sid);
    const { group } = parseStudentId(sid);
    modalRoot.innerHTML = `
      <div class="overlay" data-action="close-item">
        <div class="modal student-modal" role="dialog" aria-modal="true">
          <button class="close" data-action="close-item" aria-label="닫기">${icon('x')}</button>
          <div class="sm-head">${groupChip(group, studentLabel(sid))}</div>
          ${it
            ? `<div class="sm-item">
                <img src="${esc(it.image)}" alt="">
                <div>
                  <span class="kicker">자료 ${ITEM_NO[itemId]}</span>
                  <h2>${esc(it.title)}</h2>
                  ${checkReason(sid) ? `<span class="pill warn">${checkReason(sid)}</span>` : ''}
                </div>
              </div>
              <p class="sm-text ${entry ? '' : 'none'}">${entry ? esc(entry.text) : '아직 정리를 저장하지 않았어요.'}</p>`
            : '<p class="sm-text none">아직 자료를 가져가지 않았어요.</p>'}
          <div class="sm-support">
            <div>
              <strong>${icon('sparkle')}쓰기 도움</strong>
              <p>켜면 이 학생의 내 보고서에 '낱말 골라 문장 만들기' 버튼이 나와요. 자료마다 준비된 보기 중에서 골라 문장을 만들 수 있어요. 학생 화면에는 '도움'이라는 말이 나오지 않아요.</p>
            </div>
            <button class="switch dark ${on ? 'on' : ''}" data-action="toggle-support" data-sid="${sid}" aria-pressed="${on}" ${fixed ? 'disabled' : ''}>
              <span>${on ? '켜짐' : '꺼짐'}</span><i></i>
            </button>
          </div>
          ${fixed ? '<p class="muted sm-note">data.js의 SUPPORT_STUDENTS에 들어 있어 여기서 끌 수 없어요.</p>' : ''}
        </div>
      </div>`;
  }

  async function toggleSupport(sid) {
    const ids = supportIds().filter((x) => x !== sid);
    const next = !ids.includes(sid) && !supportIds().includes(sid);
    if (next) ids.push(sid);
    try {
      await Store.setSetting('supportIds', ids.join(','));
      toast(next ? `${studentLabel(sid)} 쓰기 도움을 켰어요.` : `${studentLabel(sid)} 쓰기 도움을 껐어요.`);
    } catch (e) {
      toast('바꾸지 못했어요. 인터넷 연결을 확인해 주세요.', 'error');
    }
  }

  // ---------- 칠판 모드 ----------
  function renderBoard() {
    const stage = BOARD_STAGES[state.board];
    const c = counts();
    let body = '';

    if (stage.id === 'motivation') {
      body = `
        <p class="b-kicker">동기 유발</p>
        <div class="b-motivation">
          <div class="b-photos">
            <figure><img src="images/items/korea-summer.webp" alt=""><figcaption>서울의 무더위쉼터 안내판</figcaption></figure>
            <figure><img src="images/items/hottest-year.webp" alt=""><figcaption>2024년 세계 기온 지도 (빨갈수록 평소보다 더움)</figcaption></figure>
          </div>
          <ol class="b-asks">
            <li>올여름 더위를 겪으며 어떤 일이 있었나요?</li>
            <li>이 더위는 지난 시간에 알아본 지구촌 문제 중 무엇과 관련이 있을까요?</li>
          </ol>
        </div>`;
    } else if (stage.id === 'question') {
      body = `
        <div class="b-center">
          <img class="b-cover" src="${UI_IMG}cover.webp" alt="">
          <p class="b-kicker">탐구 질문</p>
          <h1 class="b-question">지구촌을 위협하는 문제에는<br>어떤 것들이 있을까요?</h1>
        </div>`;
    } else if (stage.id === 'activities') {
      const acts = [
        ['활동 1', '우리 모둠 자료 찾기', '10분', '섞여 있는 자료 가운데 우리 모둠 주제에 해당하는 자료를 찾아, 한 사람이 하나씩 가져가요.'],
        ['활동 2', '맡은 사례 정리하기', '5분', '가져간 자료의 문제 상황과 심각성을 1~2문장으로 정리해 웹앱에 올려요.'],
        ['활동 3', '친구에게 설명하고 정리하기', '15분', '같은 번호끼리 새 모둠을 만들어 서로 설명하고, 활동지 정리표를 채워요.'],
      ].map(([k, t, m, d]) => `
        <div class="b-act">
          <span class="b-act-no">${k}</span>
          <h2>${t}</h2>
          <p>${d}</p>
          <span class="b-act-time">${icon('calendar')}${m}</span>
        </div>`).join('');
      body = `
        <p class="b-kicker">탐구 활동 안내</p>
        <h1>오늘은 이렇게 탐구해요</h1>
        <div class="b-acts">${acts}</div>
        <div class="b-groups">${GROUPS.map((g) => {
          const st = GROUP_STYLE[g.id];
          return `<span style="--g:${st.color};--gs:${st.soft}">${emblem(g.id)}${esc(g.name)}</span>`;
        }).join('')}</div>`;
    } else if (stage.id === 'act1') {
      body = `
        <p class="b-kicker">활동 1 · 10분</p>
        <h1>우리 모둠 자료 찾기</h1>
        <ol class="b-steps">
          <li>우리 모둠이 맡은 지구촌 문제는 무엇인가요?</li>
          <li>자료 가운데 <b>우리 모둠 주제에 해당하는 자료</b>는 무엇인가요?</li>
          <li><b>지구촌을 위협하는 문제를 다룬 자료가 아닌 것</b>은 무엇인가요?</li>
          <li>모둠원이 각자 맡을 사례를 하나씩 정해 <b>가져가기</b>를 눌러요.</li>
        </ol>
        ${progress('자료를 가져간 사람', c.claimed)}`;
    } else if (stage.id === 'act2') {
      body = `
        <p class="b-kicker">활동 2 · 5분</p>
        <h1>맡은 사례 정리하기</h1>
        <ol class="b-steps">
          <li>맡은 사례에서는 <b>어떤 문제</b>가 일어나고 있나요?</li>
          <li>그 문제는 <b>얼마나 심각한가요?</b></li>
          <li>정리한 내용을 '내 보고서'에 쓰고 <b>저장</b>을 눌러요.</li>
          <li>활동지 표의 <b>우리 모둠 줄</b>에 ○ 하고, 그 줄을 먼저 채워요.</li>
        </ol>
        <p class="b-example">예) 투발루의 섬들이 바닷물에 잠기고 있습니다. 9개 섬 가운데 2개가 이미 거의 잠길 만큼 심각합니다.</p>
        ${progress('정리를 저장한 사람', c.written)}`;
    } else if (stage.id === 'act3') {
      const teams = NUMS.map((n) => `
        <div class="b-team">
          <h3>${n}번 모둠</h3>
          <ul>${GROUPS.map((g) => `<li>${emblem(g.id)}${esc(g.name)} ${n}번</li>`).join('')}</ul>
        </div>`).join('');
      body = `
        <p class="b-kicker">활동 3 · 15분</p>
        <h1>친구에게 설명하고 정리하기</h1>
        <div class="b-teams">${teams}</div>
        <ol class="b-steps compact">
          <li>'내 보고서'에서 <b>설명 모드</b>를 켜고, 사진을 보여 주며 내가 맡은 문제를 설명해요.</li>
          <li>친구의 설명을 듣고 <b>활동지 표의 빈칸</b>을 채워요.</li>
        </ol>`;
    } else if (stage.id === 'overlap') {
      body = `
        <p class="b-kicker">정리 ①</p>
        <h1>두 가지 문제에 모두 해당하는 사례가 있었나요?</h1>
        ${overlapCards()}`;
    } else if (stage.id === 'summary') {
      const cols = GROUPS.map((g) => {
        const st = GROUP_STYLE[g.id];
        const ids = [...new Set(NUMS.map((n) => claimOf(makeStudentId(g.id, n))).filter(Boolean))];
        const list = ids.length
          ? ids.map((id) => `<li><em>${ITEM_NO[id]}</em>${esc(itemsById[id].title)}</li>`).join('')
          : '<li class="none">아직 모은 자료가 없어요.</li>';
        return `
          <div class="b-col" style="--g:${st.color};--gs:${st.soft}">
            <h3>${emblem(g.id)}${esc(g.name)}</h3>
            <ul>${list}</ul>
          </div>`;
      }).join('');
      body = `
        <p class="b-kicker">정리 ②</p>
        <h1>지구촌을 위협하는 문제에는 어떤 것들이 있나요?</h1>
        <div class="b-cols">${cols}</div>
        <p class="b-note">여러 문제가 서로 얽혀 있기도 해요.</p>`;
    } else if (stage.id === 'postit') {
      body = `
        <div class="b-center">
          <p class="b-kicker">정리 ③</p>
          <h1>탐구 질문에 대한 생각을<br>포스트잇에 한 문장으로 써 봅시다</h1>
          <div class="b-postit">
            <span>탐구 질문</span>
            <p>지구촌을 위협하는 문제에는 어떤 것들이 있을까요?</p>
          </div>
          <p class="b-example">예) 지구촌을 위협하는 문제에는 투발루의 섬이 바닷물에 잠기는 기후변화 문제, 수단 사람들이 전쟁으로 살 곳을 잃는 난민 문제 등이 있습니다.</p>
        </div>`;
    } else if (stage.id === 'preview') {
      body = `
        <p class="b-kicker">차시 예고</p>
        <h1>아무 모둠도 가져가지 않은 자료들은 무엇에 관한 자료인가요?</h1>
        ${state.boardReveal
          ? `${remainingCards()}<p class="b-next">다음 시간에는 이 문제들을 해결하기 위해 어떤 사람들과 단체가 노력하고 있는지 살펴보겠습니다.</p>`
          : `<div class="reveal"><button class="btn btn-large btn-sun" data-action="board-reveal">${icon('eye')}남은 자료 보기</button></div>`}`;
    }

    const dots = BOARD_STAGES.map((s, i) => `
      <button class="b-dot" data-action="board-go" data-stage="${i}" aria-current="${i === state.board}">${s.label}</button>`).join('');
    const friendsOpen = !!state.db.settings.friendsOpen;

    app.innerHTML = `
      <div class="b-screen">
        ${stage.minutes ? timerHtml() : ''}
        <div class="b-body stage-${stage.id}">${body}</div>
        <nav class="b-nav">
          <button class="btn btn-ghost" data-action="board-prev" ${state.board === 0 ? 'disabled' : ''}>${icon('arrowLeft')}이전</button>
          <div class="b-dots">${dots}</div>
          <button class="b-mini-switch ${friendsOpen ? 'on' : ''}" data-action="toggle-friends" title="학생 화면의 친구 보고서 탭">
            ${icon(friendsOpen ? 'unlock' : 'lock')}친구 보고서 ${friendsOpen ? '열림' : '닫힘'}
          </button>
          <button class="btn" data-action="board-next" ${state.board === BOARD_STAGES.length - 1 ? 'disabled' : ''}>다음${icon('arrowRight')}</button>
          <button class="btn-text b-exit" data-action="board-exit">${icon('x')}나가기</button>
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
  // 활동 단계에 들어가면 지도안 시간으로 맞춰지고, -1분 / +1분으로 조절한다.
  function timerLeft() {
    const t = state.timer;
    return t.running ? Math.max(0, Math.round((t.endAt - Date.now()) / 1000)) : t.left;
  }

  function fmt(sec) {
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }

  function setStageTimer(stage) {
    state.timer = { stageId: stage.id, duration: stage.minutes * 60, left: stage.minutes * 60, running: false, endAt: 0 };
  }

  function adjustTimer(minutes) {
    const t = state.timer;
    if (t.running) {
      t.endAt = Math.max(Date.now(), t.endAt + minutes * 60000);
    } else {
      t.left = Math.max(0, t.left + minutes * 60);
    }
    render();
  }

  function timerHtml() {
    const left = timerLeft();
    return `
      <div class="b-timer ${left === 0 ? 'ended' : ''}">
        <div id="timer-display" class="t-display">${left === 0 ? '시간 끝!' : fmt(left)}</div>
        <div class="t-controls">
          <button data-action="timer-minus">−1분</button>
          <button data-action="timer-toggle" aria-label="${state.timer.running ? '멈춤' : '시작'}">${icon(state.timer.running ? 'pause' : 'play')}</button>
          <button data-action="timer-plus">+1분</button>
          <button data-action="timer-reset" aria-label="처음 시간으로">${icon('reset')}</button>
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
      toast(next ? '학생 화면에서 친구 보고서가 열렸어요.' : '친구 보고서를 닫았어요.');
    } catch (e) {
      toast('바꾸지 못했어요. 인터넷 연결을 확인해 주세요.', 'error');
    }
  }

  async function toggleLinks() {
    const next = !state.db.settings.linksOpen;
    try {
      await Store.setSetting('linksOpen', next);
      toast(next ? '학생 화면에 관련 자료 링크가 보여요.' : '관련 자료 링크를 숨겼어요.');
    } catch (e) {
      toast('바꾸지 못했어요. 인터넷 연결을 확인해 주세요.', 'error');
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
      toast('초기화하지 못했어요. 인터넷 연결을 확인해 주세요.', 'error');
    }
  }

  function boardGo(i) {
    state.board = Math.max(0, Math.min(BOARD_STAGES.length - 1, i));
    const stage = BOARD_STAGES[state.board];
    if (stage.minutes && !state.timer.running && state.timer.stageId !== stage.id) setStageTimer(stage);
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
      toast('PIN이 맞지 않아요.', 'error');
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
      case 'toggle-links':
        toggleLinks();
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
        state.openStudent = null;
        renderItemModal();
        break;
      case 'open-student':
        state.openStudent = el.dataset.sid;
        renderItemModal();
        break;
      case 'toggle-support':
        toggleSupport(el.dataset.sid);
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
      case 'timer-minus':
        adjustTimer(-1);
        break;
      case 'timer-plus':
        adjustTimer(1);
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
    if (e.key === 'Escape' && (state.openItemId || state.openStudent)) {
      state.openItemId = null;
      state.openStudent = null;
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
