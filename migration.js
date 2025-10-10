// public/migration.js — красивый "мягкий" баннер (Montserrat, Акулка, крупные кнопки)
(function () {
  const SHARK_SRC = '/assets/shark.png';         // ← положи картинку сюда (или поменяй путь)
  const GOOGLE_FONT = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&display=swap';

  // --- правим CSS в migration.js ---
  const CSS = `
    .migr-font{font-family:'Montserrat',sans-serif}
    .migr-banner{
      position:fixed;left:0;right:0;bottom:-220px;z-index:99999;
      background:linear-gradient(135deg,#18c06f 0%,#1ED760 40%,#19c37d 100%);
      color:#fff; box-shadow:0 -10px 30px rgba(0,0,0,.35);
      transition:bottom .6s ease;
    }
    .migr-banner.show{bottom:0}

    /* сетка: картинка + контент, на одном уровне по верху */
    .migr-wrap{
      display:grid; grid-template-columns:75px 1fr; gap:14px;
      align-items:start;                      /* ← картинка на уровне заголовка */
      padding:16px 16px 18px; max-width:980px; margin:0 auto;
    }

    /* +3px к размеру изображения, не мешает кнопкам */
    .migr-img{
      width:75px; height:75px;                /* ← было 72x72 */
      border-radius:16px; object-fit:cover;
      box-shadow:0 8px 18px rgba(0,0,0,.25); background:#0b1e13;
      align-self:start;                       /* ← старт по вертикали */
    }

    .migr-title{
      font-weight:800; font-size:18px; line-height:1.25;
      margin:0 0 8px 0;                       /* ← отступ под заголовком */
    }
    .migr-sub{
      font-weight:600; font-size:14px; opacity:.95;
      margin:0 0 12px 0;                       /* ← больше воздуха до кнопок */
    }
    .migr-link{color:#fff; font-weight:800; text-decoration:underline}

    /* кнопки: слева направо, по 50% */
    .migr-actions{
      display:flex; flex-wrap:wrap; gap:12px;
      justify-content:flex-start;              /* ← старт слева */
    }
    .migr-btn{
      flex:1 1 50%;                            /* ← каждая ~50% ширины */
      min-width:calc(50% - 6px);               /* ← с учётом gap */
      background:#fff; color:#0b1e13; border:none; border-radius:12px;
      padding:14px 16px; font-weight:800; font-size:16px;
      cursor:pointer; transition:transform .08s ease,opacity .2s ease;
    }
    .migr-btn:hover{transform:translateY(-1px)}
    .migr-btn:active{transform:translateY(0)}
    .migr-btn:disabled{opacity:.6; cursor:progress}

    @media (min-width:760px){
      .migr-wrap{grid-template-columns:91px 1fr}   /* ← +3px к десктопу */
      .migr-img{width:91px;height:91px;border-radius:18px}
      .migr-title{font-size:20px}
      .migr-btn{font-size:17px}
    }
  `;


  function injectAssets(){
    // стиль
    if(!document.getElementById('migr-style')){
      const s=document.createElement('style'); s.id='migr-style'; s.textContent=CSS; document.head.appendChild(s);
    }
    // Montserrat (если оффлайн — простоfallback)
    if(!document.getElementById('migr-font')){
      const l=document.createElement('link'); l.id='migr-font'; l.rel='stylesheet'; l.href=GOOGLE_FONT;
      document.head.appendChild(l);
    }
  }

  function exportFullBackup(){
    try{
      const budgetsRaw   = localStorage.getItem('budgets') || '[]';
      const budgets      = JSON.parse(budgetsRaw);
      const userId       = localStorage.getItem('budgetit-user-id') || null;
      const currentIdx   = localStorage.getItem('currentBudgetIndex');
      const productNames = JSON.parse(localStorage.getItem('productNames') || '[]');

      const payload = {
        meta: { app: 'BudgetIt', at: new Date().toISOString(), version: '2.9.x' },
        budgets,
        userId,
        currentBudgetIndex: currentIdx ? parseInt(currentIdx, 10) : 0,
        productNames
      };

      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), { href:url, download:'budgetit-backup.json' });
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch(e){
      alert('Не удалось экспортировать данные');
      console.error('[Migration export]', e);
    }
  }

  function renderBanner(newHost){
    injectAssets();

    const bar = document.createElement('div');
    bar.className = 'migr-banner migr-font';
    bar.innerHTML = `
      <div class="migr-wrap">
        <img src="${SHARK_SRC}" alt="Акулка" class="migr-img" onerror="this.style.display='none'"/>
        <div>
          <p class="migr-title">🦈 Акулка переехала в новый уютный дом!</p>
          <p class="migr-sub">Забирай свои вещички (экспортируй данные), и смело двигайся вместе с ней на новый адрес: 
            <a class="migr-link" href="https://${newHost}" target="_blank" rel="noopener">budgetit.app</a>
          </p>
          <div class="migr-actions">
            <button class="migr-btn" id="migr-export">📤 Забрать данные</button>
            <button class="migr-btn" id="migr-go">➡ Переехать с Акулкой</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(bar);
    setTimeout(()=>bar.classList.add('show'), 250);

    const btnExp = bar.querySelector('#migr-export');
    const btnGo  = bar.querySelector('#migr-go');

    btnExp.addEventListener('click', () => {
      btnExp.disabled = true;
      try { exportFullBackup(); }
      finally { setTimeout(()=>btnExp.disabled=false, 1000); }
    });
    btnGo.addEventListener('click', () => { location.href = `https://${newHost}`; });
  }

  window.setupMigration = ({ oldHost, newHost }) => {
    if (location.hostname === oldHost) renderBanner(newHost);
  };
})();
