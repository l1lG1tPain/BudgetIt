// currencyChips.js — ЦБ/НБ провайдеры + крипта + 7-дневный спарклайн (inline SVG)
// ---------------------------------------------------------------------------------

(function () {
  const CONTAINER_ID = 'currency-chips-placeholder';
  const TTL_MS       = 60 * 60 * 1000;
  const SPARK_DAYS   = 7;

  // Если поднимешь прокси на том же домене — оставь пустым
  const PROXY_BASE   = '';

  const REGION_CFG = {
    UZ: { base: 'UZS', pairs: [['USD','UZS'],['EUR','UZS'],['RUB','UZS'],['CNY','UZS']], providers: ['cbu','host'] },
    RU: { base: 'RUB', pairs: [['USD','RUB'],['EUR','RUB'],['CNY','RUB'],['KZT','RUB']], providers: ['cbr','host'] },
    KZ: { base: 'KZT', pairs: [['USD','KZT'],['EUR','KZT'],['RUB','KZT'],['KGS','KZT']], providers: ['nbk','host'] },
    KG: { base: 'KGS', pairs: [['USD','KGS'],['EUR','KGS'],['RUB','KGS'],['KZT','KGS']], providers: ['nbkr','host'] },
  };

  const CRYPTO_PAIRS = [
    { foreign: 'BTC',  base: 'USD', label: 'Текущий' },
    { foreign: 'USDT', base: 'USD', label: 'Текущий' },
  ];

  // ===== region / cache =====
  function getRegion(){ try{ return localStorage.getItem('region') || 'UZ'; }catch{ return 'UZ'; } }
  function getCache(key){ try{ const raw=localStorage.getItem(key); if(!raw) return null; const {t,v}=JSON.parse(raw); if(Date.now()-t<TTL_MS) return v; }catch{} return null; }
  function setCache(key,v){ try{ localStorage.setItem(key, JSON.stringify({t:Date.now(), v})); }catch{} }

  // ===== flags =====
  function flagOf(code){
    switch(code){
      case 'UZS': return '🇺🇿'; case 'RUB': return '🇷🇺';
      case 'KZT': return '🇰🇿'; case 'KGS': return '🇰🇬';
      case 'USD': return '🇺🇸'; case 'EUR': return '🇪🇺'; case 'CNY': return '🇨🇳';
      case 'BTC': return '₿';   case 'USDT': return '₮';
      default: return '💱';
    }
  }

  // ===== providers (фиат) =====
  async function fetchFromCBU(symbols){
    const key='rates:CBU'; const cached=getCache(key); if(cached) return cached;
    const res=await fetch('https://cbu.uz/ru/arkhiv-kursov-valyut/json/', {cache:'no-store'});
    if(!res.ok) throw new Error('CBU failed');
    const js=await res.json();
    const map={};
    js.forEach(r=>{
      const code=r.Ccy; if(!symbols.includes(code)) return;
      const value=Number(r.Rate); const diff=Number(r.Diff);
      const prev=!isNaN(diff)?(value-diff):null;
      if(!isNaN(value)) map[code]={value, prev};
    });
    const out={base:'UZS', rates:map}; setCache(key,out); return out;
  }

  async function fetchFromCBR(symbols){
    const key='rates:CBR'; const cached=getCache(key); if(cached) return cached;
    const res=await fetch('https://www.cbr-xml-daily.ru/daily_json.js',{cache:'no-store'});
    if(!res.ok) throw new Error('CBR failed');
    const js=await res.json();
    const map={}, val=js.Valute||{};
    symbols.forEach(code=>{ const v=val[code]; if(v) map[code]={value:Number(v.Value), prev:Number(v.Previous)}; });
    const out={base:'RUB', rates:map}; setCache(key,out); return out;
  }

  // NBK/NBKR — через свой серверлес-прокси (иначе CORS)
  async function fetchFromNBK(symbols){
    const key='rates:NBK:'+symbols.join(','); const cached=getCache(key); if(cached) return cached;
    const url=`${PROXY_BASE}/api/nbk?symbols=${encodeURIComponent(symbols.join(','))}`;
    const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw new Error('NBK proxy failed');
    const out=await r.json(); if(!out?.rates||!Object.keys(out.rates).length) throw new Error('NBK proxy empty');
    setCache(key,out); return out;
  }
  async function fetchFromNBKR(symbols){
    const key='rates:NBKR:'+symbols.join(','); const cached=getCache(key); if(cached) return cached;
    const url=`${PROXY_BASE}/api/nbkr?symbols=${encodeURIComponent(symbols.join(','))}`;
    const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw new Error('NBKR proxy failed');
    const out=await r.json(); if(!out?.rates||!Object.keys(out.rates).length) throw new Error('NBKR proxy empty');
    setCache(key,out); return out;
  }

  // Фолбэк: кросс-курс от USD
  async function fetchFromHost(base, symbols){
    const key=`rates:host:USD->${base}:${symbols.join(',')}`; const cached=getCache(key); if(cached) return cached;
    const url=`https://api.exchangerate.host/latest?base=USD&symbols=${encodeURIComponent([base,...symbols].join(','))}`;
    const res=await fetch(url,{cache:'no-store'}); if(!res.ok) throw new Error('Host failed');
    const R=(await res.json()).rates||{};
    const map={};
    symbols.forEach(code=>{ const rb=+R[base], rf=+R[code]; if(rb>0&&rf>0) map[code]={value:rb/rf, prev:null}; });
    if(!Object.keys(map).length) throw new Error('Host no data');
    const out={base, rates:map}; setCache(key,out); return out;
  }

  async function loadToday(region){
    const cfg=REGION_CFG[region]||REGION_CFG.UZ;
    const base=cfg.base;
    const symbols=[...new Set(cfg.pairs.map(([f])=>f))];
    for(const p of cfg.providers){
      try{
        let out;
        if(p==='cbu')  out = await fetchFromCBU(symbols);
        else if(p==='cbr')  out = await fetchFromCBR(symbols);
        else if(p==='nbk')  out = await fetchFromNBK(symbols);
        else if(p==='nbkr') out = await fetchFromNBKR(symbols);
        else if(p==='host') out = await fetchFromHost(base, symbols);
        return { ...out, source: p };
      }catch(e){ console.warn('[currencyChips] provider failed:', p, e); }
    }
    throw new Error('All providers failed');
  }

  // ===== crypto =====
  async function loadCryptoToday(){
    const key='rates:crypto:v1'; const cached=getCache(key); if(cached) return cached;
    try{
      const res=await fetch('https://api.coinbase.com/v2/exchange-rates?currency=USD',{cache:'no-store'});
      if(!res.ok) throw new Error('coinbase failed');
      const rates=(await res.json())?.data?.rates||{};
      const BTC=rates.BTC?1/Number(rates.BTC):null;
      const USDT=rates.USDT?1/Number(rates.USDT):1.00;
      const out={base:'USD', rates:{BTC:{value:BTC,prev:null}, USDT:{value:USDT,prev:null}}};
      setCache(key,out); return out;
    }catch(e){ console.warn('[crypto] coinbase failed, fallback to host', e); }
    try{
      const res=await fetch('https://api.exchangerate.host/latest?base=USD&symbols=BTC,USDT',{cache:'no-store'});
      if(!res.ok) throw new Error('host crypto failed');
      const js=await res.json();
      const out={base:'USD', rates:{BTC:{value:+js.rates?.BTC||null,prev:null}, USDT:{value:+js.rates?.USDT||1.00,prev:null}}};
      setCache(key,out); return out;
    }catch(e){ console.warn('[crypto] host failed', e); }
    return {base:'USD', rates:{}};
  }

  // ===== UI helpers =====
  const SOURCE_NAMES = { cbu:'ЦБ Узбекистана', cbr:'ЦБ России', nbk:'Нацбанк Казахстана', nbkr:'НБ Кыргызстана', host:'exchangerate.host' };
  const SYMBOLS = { USD:'$', EUR:'€', RUB:'₽', CNY:'¥', KZT:'₸', KGS:'с', UZS:'сум' };
  const DEFAULT_ON = { UZ:['USD','RUB'], RU:['USD','EUR'], KZ:['USD','RUB'], KG:['USD','RUB'] };
  const FX_VISIBLE_KEY = 'budgetit:fxVisible';
  const LAST_KEY = 'budgetit:fx:last';

  let state = { fiat:null, crypto:null, series:{}, updatedAt:null, offline:false };

  function fmt(n, d = 2){
    try{
      if(n===null || n===undefined || isNaN(n)) return '—';
      return new Intl.NumberFormat('ru-RU',{minimumFractionDigits:d, maximumFractionDigits:d}).format(n);
    }catch{ return '—'; }
  }
  function fmt0(n){ return fmt(n,0); }

  function fxVisible(region){
    let saved = {};
    try{ saved = JSON.parse(localStorage.getItem(FX_VISIBLE_KEY) || '{}')[region] || null; }catch{}
    const cfg = REGION_CFG[region] || REGION_CFG.UZ;
    const all = cfg.pairs.map(([f])=>f);
    if (saved && typeof saved === 'object') return all.filter(c => saved[c] !== false && (saved[c] === true || (DEFAULT_ON[region]||[]).includes(c)));
    return all.filter(c => (DEFAULT_ON[region]||[]).includes(c));
  }
  function setFxVisible(region, code, on){
    let all = {};
    try{ all = JSON.parse(localStorage.getItem(FX_VISIBLE_KEY) || '{}'); }catch{}
    const cfg = REGION_CFG[region] || REGION_CFG.UZ;
    const cur = all[region] || {};
    cfg.pairs.forEach(([f]) => { if (cur[f] === undefined) cur[f] = (DEFAULT_ON[region]||[]).includes(f); });
    cur[code] = !!on;
    all[region] = cur;
    try{ localStorage.setItem(FX_VISIBLE_KEY, JSON.stringify(all)); }catch{}
    renderMain(); renderSheet();
  }

  // Спарклайн; рост — красным (--out), падение — зелёным (--in), как в макете
  function svgSpark(values, width=64, height=20){
    const pts=values.filter(v=>typeof v==='number' && v>0);
    if(pts.length<2) return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"></svg>`;
    const min=Math.min(...pts), max=Math.max(...pts), span=Math.max(max-min,1e-9);
    const step=width/Math.max(values.length-1,1);
    const trend=pts[pts.length-1]-pts[0];
    const color=trend>0?'var(--out,#ff4b5c)':(trend<0?'var(--in,#27AE60)':'var(--muted,#888)');
    let d='';
    values.forEach((v,i)=>{
      if(typeof v!=='number'||v<=0) return;
      const x=i*step, y=height-((v-min)/span)*(height-4)-2;
      d+=(d?' L':'M')+x.toFixed(1)+' '+y.toFixed(1);
    });
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function seriesFor(code, rate){
    const s = (state.series[code] || []).filter(v => typeof v === 'number');
    if (s.length >= 2) return s;
    if (rate && typeof rate.prev === 'number' && typeof rate.value === 'number') return [rate.prev, rate.value];
    return [];
  }
  function deltaPct(code, rate){
    const s = seriesFor(code, rate);
    if (s.length < 2) return null;
    return (s[s.length-1] - s[0]) / s[0] * 100;
  }

  function readBalance(){
    const el = document.querySelector('#block-budget .block-value');
    if (!el) return null;
    const digits = (el.textContent || '').replace(/[^\d,.\-−]/g,'').replace('−','-').replace(/\s/g,'').replace(',', '.');
    const n = parseFloat(digits);
    return isNaN(n) ? null : n;
  }

  // ===== главная: чипы «≈ 381 $» + «💱 Курсы ›» =====
  function renderMain(){
    const anchor = document.getElementById(CONTAINER_ID);
    if (!anchor) return;
    const region = getRegion();
    const bal = readBalance();
    const rates = state.fiat?.rates || {};
    const chips = fxVisible(region).map(code => {
      const r = rates[code];
      if (!r || !r.value || bal === null) return '';
      return `<span class="fx-chip">≈ ${fmt0(bal / r.value)} ${SYMBOLS[code] || code}</span>`;
    }).join('');
    anchor.innerHTML = `<div class="fx-row">${chips}<button type="button" class="fx-open" id="fx-open-btn">💱 Курсы ›</button></div>`;
    anchor.querySelector('#fx-open-btn').addEventListener('click', openSheet);
  }

  // ===== шторка «Курсы валют» =====
  function ensureSheet(){
    let sheet = document.getElementById('fx-sheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'fx-sheet';
    sheet.className = 'bottom-sheet hidden';
    sheet.innerHTML = `
      <div class="sheet-title-row"><h2>Курсы валют</h2><button type="button" class="sheet-x" id="fx-sheet-x" aria-label="Закрыть">✕</button></div>
      <div class="fx-source"><span id="fx-source-text"></span><button type="button" id="fx-refresh" aria-label="Обновить">↻</button></div>
      <div id="fx-table"></div>
      <div id="fx-crypto"></div>
      <div id="fx-calc" class="fx-calc"></div>`;
    document.body.appendChild(sheet);
    sheet.querySelector('#fx-sheet-x').addEventListener('click', closeSheet);
    sheet.querySelector('#fx-refresh').addEventListener('click', () => loadAndRender(true));
    return sheet;
  }
  function openSheet(){
    const sheet = ensureSheet();
    renderSheet();
    const ui = window._budgetAppRef?.uiManager;
    if (ui?.openModal) ui.openModal('fx-sheet');
    else { sheet.classList.remove('hidden'); document.getElementById('bottom-sheet-backdrop')?.classList.remove('hidden'); }
  }
  function closeSheet(){
    const ui = window._budgetAppRef?.uiManager;
    if (ui?.closeModal) ui.closeModal('fx-sheet');
    else document.getElementById('fx-sheet')?.classList.add('hidden');
  }

  function rowHtml(code, base, rate, on){
    const val = rate?.value;
    const buy = typeof val === 'number' ? val*0.995 : null;
    const sell = typeof val === 'number' ? val*1.005 : null;
    const d = deltaPct(code, rate);
    const arrow = d === null || Math.abs(d) < 0.005 ? '' : (d > 0 ? '▲' : '▼');
    const cls = d === null ? '' : (d > 0 ? 'up' : 'down');
    return `<div class="fx-row-item">
      <div class="fx-row-top">
        <div class="fx-cur"><span class="fx-flag">${flagOf(code)}</span><b>${code}</b></div>
        <div class="fx-vals"><small>Покупка</small><b>${fmt(buy)}</b></div>
        <div class="fx-vals"><small>Продажа</small><b>${fmt(sell)}</b></div>
        <label class="sw fx-sw" title="На главной"><input type="checkbox" data-fx="${code}" ${on ? 'checked' : ''}><span></span></label>
      </div>
      <div class="fx-row-bottom"><span class="fx-spark">${svgSpark(seriesFor(code, rate))}</span>
        <span class="fx-delta ${cls}">${arrow} ${d === null ? '' : fmt(Math.abs(d)) + '%'}</span></div>
    </div>`;
  }

  function renderSheet(){
    const sheet = document.getElementById('fx-sheet');
    if (!sheet) return;
    const region = getRegion(); const cfg = REGION_CFG[region] || REGION_CFG.UZ;
    const src = state.fiat?.source;
    const when = state.updatedAt ? new Date(state.updatedAt).toLocaleString('ru-RU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';
    sheet.querySelector('#fx-source-text').textContent =
      `${SOURCE_NAMES[src] || 'Курсы'} · обновлено ${when}${state.offline ? ' (офлайн)' : ''}`;
    const rates = state.fiat?.rates || {};
    const on = fxVisible(region);
    sheet.querySelector('#fx-table').innerHTML = `
      <div class="fx-head"><span></span><span>Покупка</span><span>Продажа</span><span>На главной</span></div>` +
      (Object.keys(rates).length
        ? cfg.pairs.map(([code, base]) => rowHtml(code, base, rates[code], on.includes(code))).join('')
        : '<div class="fx-empty">Курсы пока не загрузились. Проверь интернет и нажми ↻.</div>');
    const cr = state.crypto?.rates || {};
    sheet.querySelector('#fx-crypto').innerHTML = (cr.BTC?.value || cr.USDT?.value) ? `
      <h3 class="fx-h">Крипта</h3>
      ${['BTC','USDT'].filter(c => cr[c]?.value).map(c => `
        <div class="fx-row-item"><div class="fx-row-top">
          <div class="fx-cur"><span class="fx-flag">${flagOf(c)}</span><b>${c}</b></div>
          <div class="fx-vals" style="grid-column: span 3; text-align:right"><b>${fmt(cr[c].value)} $</b></div>
        </div></div>`).join('')}` : '';
    sheet.querySelectorAll('input[data-fx]').forEach(inp => {
      inp.addEventListener('change', () => setFxVisible(region, inp.dataset.fx, inp.checked));
    });
    renderCalc();
  }

  // ===== калькулятор валют (внизу шторки) =====
  // «Обменник»: отдаём валюту по курсу ПОКУПКИ (банк покупает), получаем по курсу ПРОДАЖИ (ЦБ ∓0,5%, как в таблице).
  // «Официальный»: везде курс ЦБ без спреда.
  const CALC_KEY = 'budgetit:fx:calc';
  const calc = { from: null, to: null, mode: 'shop', amount: '' };
  const QUICK = { UZS:[100000,500000,1000000], KZT:[10000,50000,100000], RUB:[1000,5000,10000], KGS:[1000,5000,10000] };
  try { Object.assign(calc, JSON.parse(localStorage.getItem(CALC_KEY) || '{}')); } catch {}
  function calcSave(){ try { localStorage.setItem(CALC_KEY, JSON.stringify({ from:calc.from, to:calc.to, mode:calc.mode, amount:calc.amount })); } catch {} }

  function calcCodes(){
    const cfg = REGION_CFG[getRegion()] || REGION_CFG.UZ;
    return [cfg.base, ...cfg.pairs.map(([f]) => f)];
  }
  function calcRate(code, side, mode){
    const cfg = REGION_CFG[getRegion()] || REGION_CFG.UZ;
    if (code === cfg.base) return 1;
    const v = state.fiat?.rates?.[code]?.value;
    if (!(v > 0)) return null;
    if (mode === 'cb') return v;
    return side === 'buy' ? v * 0.995 : v * 1.005;
  }
  // сумма в валюте from → сумма в валюте to (null, если курса нет)
  function convert(amount, from, to, mode = calc.mode){
    if (!(amount >= 0)) return null;
    if (from === to) return amount;
    const a = calcRate(from, 'buy', mode), b = calcRate(to, 'sell', mode);
    if (!a || !b) return null;
    return amount * a / b;
  }
  function calcDec(code, n){ return (code === 'UZS' || code === 'KZT') ? 0 : (n !== undefined && n > 0 && n < 1 ? 4 : 2); }
  function parseAmount(str){ const n = parseFloat(String(str || '').replace(/\s/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; }
  function formatAmountInput(raw){
    const s = String(raw).replace(/[^\d.,]/g, '');
    const m = s.match(/^(\d*)([.,]?)(\d{0,2})/);
    const int = (m[1] || '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return int + (m[2] ? ',' + (m[3] || '') : '');
  }

  function ensureCalc(){
    const host = document.getElementById('fx-calc');
    if (!host) return null;
    if (host.dataset.ready) return host;
    host.dataset.ready = '1';
    host.innerHTML = `
      <h3 class="fx-h">Калькулятор</h3>
      <div class="fx-calc-card">
        <div class="fx-calc-mode" id="fx-calc-mode"><button type="button" data-mode="shop">Обменник</button><button type="button" data-mode="cb">По курсу ЦБ</button></div>
        <div class="fx-calc-line"><input id="fx-calc-amount" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="Сумма"><select id="fx-calc-from" aria-label="Из валюты"></select></div>
        <div class="fx-calc-swap"><button type="button" id="fx-calc-swap" aria-label="Поменять валюты местами">⇅</button></div>
        <div class="fx-calc-line"><output id="fx-calc-result" class="empty">0</output><select id="fx-calc-to" aria-label="В валюту"></select></div>
        <div class="fx-calc-quick" id="fx-calc-quick"></div>
        <div class="fx-calc-note" id="fx-calc-note"></div>
      </div>`;
    const input = host.querySelector('#fx-calc-amount');
    input.addEventListener('input', () => {
      const sig = v => (v.match(/[\d,]/g) || []).length;
      const before = sig(input.value.slice(0, input.selectionStart ?? input.value.length));
      input.value = formatAmountInput(input.value);
      let pos = 0, seen = 0;
      while (pos < input.value.length && seen < before) { if (/[\d,]/.test(input.value[pos])) seen++; pos++; }
      try { input.setSelectionRange(pos, pos); } catch {}
      calc.amount = input.value; calcSave(); renderCalc();
    });
    input.addEventListener('focus', () => setTimeout(() => host.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 250));
    host.querySelector('#fx-calc-from').addEventListener('change', e => { calc.from = e.target.value; if (calc.to === calc.from) calc.to = calcCodes().find(c => c !== calc.from); calcSave(); renderCalc(); });
    host.querySelector('#fx-calc-to').addEventListener('change', e => { calc.to = e.target.value; if (calc.from === calc.to) calc.from = calcCodes().find(c => c !== calc.to); calcSave(); renderCalc(); });
    host.querySelector('#fx-calc-swap').addEventListener('click', () => { [calc.from, calc.to] = [calc.to, calc.from]; calcSave(); renderCalc(); });
    host.querySelector('#fx-calc-mode').addEventListener('click', e => { const b = e.target.closest('button[data-mode]'); if (b) { calc.mode = b.dataset.mode; calcSave(); renderCalc(); } });
    host.querySelector('#fx-calc-quick').addEventListener('click', e => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      calc.amount = formatAmountInput(b.dataset.v); input.value = calc.amount; calcSave(); renderCalc();
    });
    return host;
  }

  function renderCalc(){
    const host = ensureCalc();
    if (!host) return;
    const cfg = REGION_CFG[getRegion()] || REGION_CFG.UZ;
    const codes = calcCodes();
    if (!codes.includes(calc.from)) calc.from = codes.find(c => c !== cfg.base) || codes[0];
    if (!codes.includes(calc.to) || calc.to === calc.from) calc.to = cfg.base !== calc.from ? cfg.base : codes[1];
    if (calc.mode !== 'cb') calc.mode = 'shop';

    const sig = codes.join(',');
    const selFrom = host.querySelector('#fx-calc-from'), selTo = host.querySelector('#fx-calc-to');
    if (host.dataset.codes !== sig) {
      const opts = codes.map(c => `<option value="${c}">${flagOf(c)} ${c}</option>`).join('');
      selFrom.innerHTML = opts; selTo.innerHTML = opts; host.dataset.codes = sig;
    }
    selFrom.value = calc.from; selTo.value = calc.to;
    host.querySelectorAll('#fx-calc-mode button').forEach(b => b.classList.toggle('active', b.dataset.mode === calc.mode));

    const input = host.querySelector('#fx-calc-amount');
    if (document.activeElement !== input && input.value !== calc.amount) input.value = calc.amount || '';

    const amount = parseAmount(calc.amount);
    const out = host.querySelector('#fx-calc-result');
    const res = amount > 0 ? convert(amount, calc.from, calc.to) : null;
    out.classList.toggle('empty', res === null);
    out.textContent = res === null ? (amount > 0 ? '—' : '0') : fmt(res, calcDec(calc.to, res));

    const q = QUICK[calc.from] || [10, 100, 1000];
    host.querySelector('#fx-calc-quick').innerHTML = q.map(v => `<button type="button" data-v="${v}">${fmt0(v)}</button>`).join('');

    let one = convert(1, calc.from, calc.to), a = calc.from, b = calc.to;
    if (one !== null && one < 1) { one = convert(1, calc.to, calc.from); a = calc.to; b = calc.from; } // «1 USD = …», а не «1 сум = 0,0001 $»
    host.querySelector('#fx-calc-note').textContent = one === null
      ? 'Курсы пока не загрузились — нажми ↻ вверху.'
      : `1 ${a} = ${fmt(one, calcDec(b, one))} ${b} · ${calc.mode === 'shop' ? 'курс обменника (ЦБ ±0,5%)' : 'официальный курс'}${state.offline ? ' · офлайн' : ''}`;
  }

  // ===== series (спарклайн) =====
  async function loadSeries(base, foreign, days = SPARK_DAYS){
    const end   = new Date();
    const start = new Date(); start.setDate(end.getDate() - (days - 1));
    const s = start.toISOString().slice(0,10), e = end.toISOString().slice(0,10);

    const key = `series:host:USD->${base}:${foreign}:${s}:${e}`;
    const cached = getCache(key); if (cached) return cached;

    const url = `https://api.exchangerate.host/timeseries?start_date=${s}&end_date=${e}&base=USD&symbols=${encodeURIComponent([base, foreign].join(','))}`;
    try {
      const js = await (await fetch(url, { cache: 'no-store' })).json();
      const daysSorted = Object.keys(js.rates || {}).sort();
      const values = daysSorted.map(d => {
        const rb = Number(js.rates[d]?.[base]);
        const rf = Number(js.rates[d]?.[foreign]);
        return (rb > 0 && rf > 0) ? (rb / rf) : null;
      });
      if (values.some(v => typeof v === 'number')) { setCache(key, values); return values; }
    } catch (err) { console.warn('[series] failed', err); }
    return [];
  }

  // ===== boot =====
  function restoreLast(){
    try{
      const last = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
      if (last && last.region === getRegion()) { state = { ...state, ...last.state, offline: true }; }
    }catch{}
  }

  async function loadAndRender(force){
    const region=getRegion(); const cfg=REGION_CFG[region]||REGION_CFG.UZ;
    if (force) { try { Object.keys(localStorage).filter(k => k.startsWith('rates:')).forEach(k => localStorage.removeItem(k)); } catch {} }
    let ok = false;
    try{
      const fiat = await loadToday(region);
      if (Object.keys(fiat.rates).length) {
        state.fiat = fiat; state.updatedAt = Date.now(); state.offline = false; ok = true;
      }
    }catch(e){ console.warn('[currencyChips] fiat failed', e); }
    try{ const c = await loadCryptoToday(); if (Object.keys(c.rates).length) state.crypto = c; }catch(e){}
    if (!ok) state.offline = true;

    renderMain(); renderSheet();

    if (ok) {
      // 7-дневные ряды подгружаем после первой отрисовки
      for (const [code, base] of cfg.pairs) {
        try { state.series[code] = await loadSeries(base, code, SPARK_DAYS); } catch {}
      }
      try { localStorage.setItem(LAST_KEY, JSON.stringify({ region, state: { fiat: state.fiat, crypto: state.crypto, series: state.series, updatedAt: state.updatedAt } })); } catch {}
      renderSheet();
    }
  }

  function init(){
    restoreLast();
    renderMain();
    const bal = document.querySelector('#block-budget .block-value');
    if (bal && window.MutationObserver) new MutationObserver(() => renderMain()).observe(bal, { childList: true, characterData: true, subtree: true });
    loadAndRender();
  }

  window.BudgetItFx = {
    open: openSheet,
    refresh: () => loadAndRender(true),
    convert: (amount, from, to, mode) => convert(amount, from, to, mode),
    pairsFor: region => ((REGION_CFG[region] || REGION_CFG.UZ).pairs.map(([f]) => f)),
    isOn: (region, code) => fxVisible(region).includes(code),
    setOn: setFxVisible,
    flagOf
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.addEventListener('budgetit:region-changed', () => { state = { fiat:null, crypto:null, series:{}, updatedAt:null, offline:false }; restoreLast(); renderMain(); loadAndRender(); });
  setInterval(loadAndRender, 15*60*1000);
})();
