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
        if(p==='cbu')  return await fetchFromCBU(symbols);
        if(p==='cbr')  return await fetchFromCBR(symbols);
        if(p==='nbk')  return await fetchFromNBK(symbols);
        if(p==='nbkr') return await fetchFromNBKR(symbols);
        if(p==='host') return await fetchFromHost(base, symbols);
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
  function mountContainer(){
    const anchor=document.getElementById(CONTAINER_ID);
    if(!anchor){ console.warn(`[currencyChips] anchor #${CONTAINER_ID} not found`); return null; }
    let c=anchor.querySelector('.currency-chip-container');
    if(c) c.innerHTML=''; else { c=document.createElement('div'); c.className='currency-chip-container'; anchor.appendChild(c); }
    return c;
  }

  // Всегда 2 знака после запятой
  function fmt(n){
    try{
      if(n===null || isNaN(n)) return '—';
      return new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2, maximumFractionDigits:2}).format(n);
    }catch{ return '—'; }
  }

  // Спарклайн (компактный)
  function svgSpark(values, width=100, height=18){
    const pts=values.filter(v=>typeof v==='number' && v>0);
    if(!pts.length) return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"></svg>`;
    const min=Math.min(...pts), max=Math.max(...pts), span=Math.max(max-min,1e-9);
    const step=width/Math.max(values.length-1,1);
    const trend=pts[pts.length-1]-pts[0];
    const color=trend>0?'#ff0000':(trend<0?'#00aa00':'#888888');

    let lineD='', areaD='', has=false;
    values.forEach((v,i)=>{
      if(typeof v!=='number'||v<=0) return;
      const x=i*step, y=height-((v-min)/span)*(height-2)-1;
      lineD+=(lineD?' L':'M')+x.toFixed(2)+' '+y.toFixed(2);
      if(!has){ areaD=`M${x} ${height} L${x} ${y}`; has=true; } else { areaD+=` L${x} ${y}`; }
    });
    if(has) areaD+=` L${(values.length-1)*step} ${height} Z`;
    const gid=`g-${Math.random().toString(36).slice(2)}`;
    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${areaD}" fill="url(#${gid})"/>
        <path d="${lineD}" fill="none" stroke="${color}" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
      </svg>
    `;
  }

  // ===== render one chip =====
  async function renderChip(container, region, fromCurr, toCurr, todayData, label, isCrypto=false){
    const r=todayData?.rates?.[fromCurr]||null;
    let value=r?.value ?? null;
    let prev =r?.prev  ?? null;

    // Спред ±0.5% только для фиата
    if(typeof value==='number' && !isNaN(value) && !isCrypto){
      value = label==='Покупка' ? value*0.995 : value*1.005;
      prev  = typeof prev==='number' ? (label==='Покупка'? prev*0.995 : prev*1.005) : null;
    }

    // Спарклайн заранее — пригодится и для стрелки, если prev отсутствует
    let series=[]; try{ series=await loadSeries(todayData.base, fromCurr, SPARK_DAYS); }catch{ series=[]; }
    const validSeries = series.filter(v=>typeof v==='number');

    // Тренд: 1) value-prev если есть prev; 2) иначе по серии (последняя - первая)
    let trendDelta = 0;
    if (typeof prev==='number' && typeof value==='number') {
      trendDelta = value - prev;
    } else if (validSeries.length >= 2) {
      trendDelta = validSeries[validSeries.length-1] - validSeries[0];
    }
    const arrow = trendDelta===0 ? '' : (trendDelta>0 ? '▲' : '▼');
    const arrowClass = trendDelta===0 ? '' : (trendDelta>0 ? 'trend-up' : 'trend-down');

    const chip=document.createElement('div');
    chip.className='currency-chip';
    chip.style.padding='6px 8px';
    chip.innerHTML = `
      <div class="chip-info" style="font-size:11px; line-height:13px; margin-bottom:4px;">
        <span>${flagOf(fromCurr)} ${fromCurr}</span>
        <span>→</span>
        <span>${flagOf(toCurr)} ${toCurr} (${label})</span>
      </div>
      <div class="chip-body" style="display:flex; align-items:center; gap:4px;">
        ${arrow ? `<span class="${arrowClass}" style="font-size:12px; line-height:1;">${arrow}</span>` : ''}
        <div class="chip-value" style="font-weight:600; font-size:14px;">${value!==null ? fmt(value) : '—'}</div>
        <div class="chip-sparkline" style="opacity:.9;margin-left:auto">${svgSpark(series, 100, 18)}</div>
      </div>
    `;
    container.appendChild(chip);
  }

  // ===== series (спарклайн) =====
  async function loadSeries(base, foreign, days = SPARK_DAYS){
    // Крипта — синтетический спокойный ряд
    if (foreign === 'BTC' || foreign === 'USDT') {
      const start = foreign === 'BTC' ? 60000 : 1.0;
      let cur = start;
      return Array.from({ length: days }, () => {
        const delta = (Math.random() - 0.5) * (foreign === 'BTC' ? 2000 : 0.02);
        cur = Math.max(0.0001, cur + delta);
        return cur;
      });
    }
    const end   = new Date();
    const start = new Date(); start.setDate(end.getDate() - (days - 1));
    const s = start.toISOString().slice(0,10), e = end.toISOString().slice(0,10);

    const key = `series:host:USD->${base}:${foreign}:${s}:${e}`;
    const cached = getCache(key); if (cached) return cached;

    const url = `https://api.exchangerate.host/timeseries?start_date=${s}&end_date=${e}&base=USD&symbols=${encodeURIComponent([base, foreign].join(','))}`;
    try {
      const js = await (await fetch(url, { cache: 'no-store' })).json();
      const daysSorted = Object.keys(js.rates || {}).sort();
      let values = daysSorted.map(d => {
        const rb = Number(js.rates[d]?.[base]);
        const rf = Number(js.rates[d]?.[foreign]);
        return (rb > 0 && rf > 0) ? (rb / rf) : null;
      });
      if (!values.some(v => typeof v === 'number')) {
        let cur = 1;
        values = Array.from({ length: days }, () => (cur = Math.max(0.0001, cur * (1 + (Math.random()-0.5)*0.01))));
      }
      setCache(key, values);
      return values;
    } catch (e) {
      console.warn('[series] host failed', e);
      return Array.from({ length: days }, () => null);
    }
  }

  // ===== boot =====
  async function loadAndRender(){
    const container=mountContainer(); if(!container) return;
    const region=getRegion(); const cfg=REGION_CFG[region]||REGION_CFG.UZ;

    let todayData={base:cfg.base, rates:{}}; try{ todayData=await loadToday(region); }catch(e){ console.warn('[currencyChips] fiat failed', e); }
    let cryptoData={base:'USD', rates:{}};   try{ cryptoData=await loadCryptoToday(); }catch(e){ console.warn('[currencyChips] crypto failed', e); }

    if(Object.keys(todayData.rates).length){
      for(const [foreign, base] of cfg.pairs){
        await renderChip(container, region, foreign, base, todayData, 'Покупка');
        await renderChip(container, region, foreign, base, todayData, 'Продажа');
      }
    }
    if(Object.keys(cryptoData.rates).length){
      for(const {base, foreign, label} of CRYPTO_PAIRS){
        if(!cryptoData.rates[foreign]?.value) continue;
        await renderChip(container, region, foreign, base, cryptoData, label, true);
      }
    }

    const badge=document.createElement('div');
    badge.className='chip-time-note';
    badge.style.marginTop='4px';
    badge.style.fontSize='11px';
    badge.textContent='Обновлено: '+new Date().toLocaleString('ru-RU');
    container.appendChild(badge);
  }

  document.addEventListener('DOMContentLoaded', loadAndRender);
  window.addEventListener('budgetit:region-changed', loadAndRender);
  setInterval(loadAndRender, 15*60*1000);
})();
