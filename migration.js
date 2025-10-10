// BudgetIt — мягкая миграция: только Экспорт + Переход (без UIManager)
(function () {
  const CSS = `
  .migr-banner{position:fixed;left:0;right:0;bottom:-120px;
    background:linear-gradient(135deg,#1ED760,#19c37d);color:#fff;
    font:15px/1.4 'Montserrat',sans-serif;z-index:99999;padding:14px 16px; font-weight:bold;
    display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;
    box-shadow:0 -4px 12px rgba(0,0,0,.25);transition:bottom .6s ease}
  .migr-banner.show{bottom:0}
  .migr-btn{background:#fff;color:#1ED760;border:none;padding:6px 12px;border-radius:8px;
    font-weight:600;cursor:pointer;transition:.2s ease}
  .migr-btn:hover{background:#f0f0f0}
  .migr-btn:disabled{opacity:.6;cursor:progress}
  `;

  function injectCss(){
    if(!document.getElementById('migr-style')){
      const s=document.createElement('style');
      s.id='migr-style'; s.textContent=CSS; document.head.appendChild(s);
    }
  }

  function exportBudgetsDirect(){
    try{
      // Берём то же, что сохраняет BudgetManager -> localStorage['budgets']
      const raw = localStorage.getItem('budgets') || '[]';
      const blob = new Blob([raw], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), { href:url, download:'budgets.json' });
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch(e){
      alert('Не удалось экспортировать данные');
    }
  }

  function renderBanner(newHost){
    injectCss();
    const el = document.createElement('div');
    el.className = 'migr-banner';
    el.innerHTML = `
      🦈 Акулка переехала на&nbsp;<a href="https://${newHost}" target="_blank" rel="noopener">budgetit.app</a>
      <button class="migr-btn" id="migr-export">📤 Экспорт</button>
      <button class="migr-btn" id="migr-go">➡ Перейти</button>
    `;
    document.body.appendChild(el);
    setTimeout(()=>el.classList.add('show'), 300);

    const btnExp = el.querySelector('#migr-export');
    const btnGo  = el.querySelector('#migr-go');

    btnExp.addEventListener('click', () => {
      btnExp.disabled = true;
      try { exportBudgetsDirect(); }
      finally { setTimeout(()=>btnExp.disabled=false, 800); }
    });
    btnGo.addEventListener('click', () => location.href = `https://${newHost}`);
  }

  // Публичный вызов
  window.setupMigration = ({ oldHost, newHost }) => {
    if (location.hostname === oldHost) renderBanner(newHost);
  };
})();
