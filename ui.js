// 학생 화면과 교사 화면이 함께 쓰는 화면 도움 함수

// 선 아이콘. 색은 글자색(currentColor)을 따른다.
const ICON_PATHS = {
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  thermo: '<path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0z"/><path d="M12 9v7"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19 13 11"/>',
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  card: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 15h6M7 11h10"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.8 3 2.6 3.5 5.2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  present: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  source: '<path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z"/><path d="M4 17a2 2 0 0 1 2-2h12"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14"/><path d="M12 17.5h.01"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5h.01"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  board: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21l4-4 4 4"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};

function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}

// 모둠별 색, 아이콘, 엠블럼. 학생의 '자기 모둠' 표시와 교사 화면에만 쓴다(자료 카드에는 쓰지 않는다).
const UI_IMG = 'images/ui/';
const GROUP_STYLE = {
  resource:  { color: '#c27a0e', soft: '#fdf1dc', icon: 'bolt' },
  climate:   { color: '#cf4f33', soft: '#fde8e2', icon: 'thermo' },
  ecosystem: { color: '#2e8653', soft: '#e1f3e8', icon: 'leaf' },
  refugee:   { color: '#6656b8', soft: '#ebe8f9', icon: 'home' },
};

function emblem(groupId, cls = '') {
  return `<img class="emblem ${cls}" src="${UI_IMG}emblem-${groupId}.webp" alt="">`;
}

function groupChip(groupId, label) {
  const s = GROUP_STYLE[groupId];
  return `<span class="gchip" style="--g:${s.color};--gs:${s.soft}">${emblem(groupId)}${esc(label)}</span>`;
}

// 지구 마스코트. kind: 'guide' | 'cheer' | 'think'
function mascot(kind, cls = '') {
  return `<img class="mascot ${cls}" src="${UI_IMG}mascot-${kind}.webp" alt="">`;
}

// 마스코트가 말풍선으로 안내하는 띠
function guideBubble(text, kind = 'guide') {
  return `<div class="guide-bubble">${mascot(kind)}<p>${text}</p></div>`;
}

// 저장처럼 기쁜 순간에 잠깐 떠오르는 칭찬 화면
let celebrateTimer = null;
function celebrate(title, sub = '') {
  document.querySelector('.celebrate')?.remove();
  const el = document.createElement('div');
  el.className = 'celebrate';
  el.innerHTML = `
    <div class="celebrate-card">
      ${mascot('cheer')}
      <strong>${esc(title)}</strong>
      ${sub ? `<span>${esc(sub)}</span>` : ''}
    </div>`;
  el.addEventListener('click', () => el.remove());
  document.body.appendChild(el);
  clearTimeout(celebrateTimer);
  celebrateTimer = setTimeout(() => el.remove(), 1800);
}

// 모든 학생과 교사가 같은 순서로 보는 자료 순서와 번호(자료 01, 02 …)
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

const ITEM_ORDER = seededShuffle(ITEMS.map((it) => it.id), SHUFFLE_SEED);
const ITEM_NO = Object.fromEntries(ITEM_ORDER.map((id, i) => [id, String(i + 1).padStart(2, '0')]));

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

let toastTimer = null;
// kind: 'ok'(초록 체크) 또는 'error'(경고)
function toast(msg, kind = 'ok') {
  const el = document.getElementById('toast');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(kind === 'error' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2500);
}

// 확인 창. 예를 누르면 true.
function confirmBox(message, sub = '', okLabel = '네', okClass = 'btn') {
  const danger = okClass.includes('danger');
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    wrap.style.zIndex = 150;
    wrap.innerHTML = `
      <div class="modal confirm" role="alertdialog" aria-modal="true">
        ${danger ? `<div class="confirm-icon danger">${icon('alert')}</div>` : mascot('think', 'confirm-mascot')}
        <p>${esc(message)}</p>
        ${sub ? `<p class="sub">${esc(sub)}</p>` : ''}
        <div class="buttons">
          <button class="btn btn-ghost btn-large" data-answer="no">아니요</button>
          <button class="${okClass} btn-large" data-answer="yes">${esc(okLabel)}</button>
        </div>
      </div>`;
    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.target.closest('[data-answer]');
      if (!btn && e.target !== wrap) return;
      wrap.remove();
      resolve(btn?.dataset.answer === 'yes');
    });
    document.body.appendChild(wrap);
    wrap.querySelector('[data-answer="yes"]').focus();
  });
}
