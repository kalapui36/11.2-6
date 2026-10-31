// 학생 화면과 교사 화면이 함께 쓰는 화면 도움 함수

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2500);
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
