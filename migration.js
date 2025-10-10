(function () {
  const CSS = `
  .migr-banner {
    position:fixed;left:0;right:0;bottom:-120px;
    background:linear-gradient(135deg,#1ED760,#19c37d);
    color:#fff;font:15px/1.4 'Montserrat',sans-serif;
    z-index:99999;padding:14px 16px;
    display:flex;gap:12px;align-items:center;
    justify-content:center;flex-wrap:wrap;
    box-shadow:0 -4px 12px rgba(0,0,0,0.25);
    transition:bottom .6s ease;
  }
  .migr-banner.show { bottom:0; }
  .migr-banner a {color:#fff;font-weight:600;text-decoration:none}
  .migr-btn {
    background:#fff;color:#1ED760;border:none;
    padding:6px 12px;border-radius:8px;
    font-weight:600;cursor:pointer;
    transition:.2s ease;
  }
  .migr-btn:hover { background:#f0f0f0; }
  .migr-btn:disabled{opacity:.6;cursor:progress}
  `;

  function injectCss() {
    if (!document.getElementById('migr-style')) {
      const s = document.createElement('style');
      s.id = 'migr-style';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
  }

  function renderBanner(newHost) {
    injectCss();
    const el = document.createElement('div');
    el.className = 'migr-banner';
    el.innerHTML = `
      🦈 Акулка переехала на&nbsp;<a href="https://${newHost}" target="_blank">budgetit.app</a>
      <button class="migr-btn" id="migr-export">📤 Экспорт</button>
      <button class="migr-btn" id="migr-go">➡ Перейти</button>
    `;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('show'), 400);

    const btnExp = el.querySelector('#migr-export');
    btnExp.addEventListener('click', () => {
      btnExp.disabled = true;
      try {
        if (window.uiManager && typeof window.uiManager.exportData === 'function') {
          window.uiManager.exportData(); // используем твой готовый метод
        } else {
          alert('Экспорт недоступен');
        }
      } finally {
        setTimeout(() => (btnExp.disabled = false), 1500);
      }
    });

    el.querySelector('#migr-go').addEventListener('click', () => {
      location.href = `https://${newHost}`;
    });
  }

  window.setupMigration = function ({ oldHost, newHost }) {
    if (location.hostname === oldHost) {
      renderBanner(newHost);
    }
  };
})();
