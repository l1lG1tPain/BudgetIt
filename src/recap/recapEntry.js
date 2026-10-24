// ===============================
//   recapEntry.js — входы в итоги: карточки на странице Аналитики и баннер на главном экране
//   Что и когда показывать — решает availableRecaps() (recapPeriods.js).
// ===============================
import { availableRecaps, isRecapSeen, markRecapSeen, recapId } from './recapPeriods.js';
import { showRecap } from './recapUI.js';

const isoToday = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const esc = x => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Ряд историй стоит под переключателем периода и над главным графиком (шапка Аналитики фиксированная, сверху отступ нужен)
function place(scroll, box) {
    const hero = document.getElementById('an-hero');
    const seg = document.getElementById('analytics-period-seg');
    if (hero && hero.parentNode === scroll) { if (box.nextElementSibling !== hero) hero.before(box); }
    else if (seg && seg.parentNode === scroll) { if (seg.nextElementSibling !== box) seg.after(box); }
    else if (scroll.firstElementChild !== box) scroll.prepend(box);
    box.classList.toggle('no-seg', !(seg && seg.parentNode === scroll));
}

export function initRecapEntry(getTransactions) {
    const list = () => { try { return availableRecaps(getTransactions() || [], isoToday()); } catch (e) { return []; } };
    const open = r => showRecap(r.kind, getTransactions() || [], isoToday());

    // ----- карточки в Аналитике -----
    const renderCards = () => {
        const scroll = document.querySelector('#analytics-page .analytics-scroll');
        if (!scroll) return;
        // то же окно дат, что у баннера на главной; но просмотренный итог остаётся (с серым кольцом), чтобы его можно было пересмотреть
        const items = list().filter(r => r.banner);
        const sig = items.map(r => recapId(r) + (isRecapSeen(r) ? ':s' : '')).join('|');
        const old = document.getElementById('an-recap-entry');
        if (!items.length) { old?.remove(); return; }
        if (old && old.dataset.sig === sig) { place(scroll, old); return; }
        old?.remove();
        const box = document.createElement('div');
        box.id = 'an-recap-entry';
        box.className = 'an-recap-entry';
        box.dataset.sig = sig;
        box.innerHTML = items.map((r, i) => `<button type="button" class="an-story ${isRecapSeen(r) ? 'is-seen' : ''}" data-i="${i}" aria-label="${esc(r.title)}">
            <span class="an-story-ring"><span class="an-story-in" aria-hidden="true">${r.icon}</span></span>
            <span class="an-story-l">${esc(r.chip || r.short)}</span></button>`).join('');
        box.addEventListener('click', e => {
            const b = e.target.closest('.an-story'); if (!b) return;
            open(items[Number(b.dataset.i)]);
        });
        place(scroll, box);
    };

    // ----- баннер на главной: один раз на период, пока не открыт и не закрыт -----
    const renderBanner = () => {
        const old = document.getElementById('recap-banner');
        const r = list().find(x => x.banner && !isRecapSeen(x));
        if (!r) { old?.remove(); return; }
        if (old && old.dataset.id === recapId(r)) return;
        old?.remove();
        const anchor = document.getElementById('akulka-card');
        if (!anchor || !anchor.parentNode) return;
        const el = document.createElement('div');
        el.id = 'recap-banner';
        el.className = 'recap-banner';
        el.dataset.id = recapId(r);
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
        el.innerHTML = `<span class="recap-banner-ico" aria-hidden="true">${r.icon}</span>
            <span class="recap-banner-txt"><b>${esc(r.kind === 'month' ? `Твой ${r.title.replace('Каким был твой ', '')} готов` : r.kind === 'week' ? 'Итоги недели готовы' : r.short + ' готов')}</b><span>${esc(r.sub.replace(/^Итоги (недели|года) · /, ''))}</span></span>
            <span class="recap-banner-go">Смотреть</span>
            <button type="button" class="recap-banner-x" aria-label="Скрыть">✕</button>`;
        const go = () => { open(r); el.remove(); };
        el.addEventListener('click', e => {
            if (e.target.closest('.recap-banner-x')) { markRecapSeen(r); el.remove(); return; }
            go();
        });
        el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        anchor.parentNode.insertBefore(el, anchor);
    };

    const renderAll = () => { renderCards(); renderBanner(); };
    window.addEventListener('budgetit:analytics-open', () => setTimeout(renderAll, 90));
    window.addEventListener('budgetit:page-open', e => { if (e.detail?.id === 'analytics-page') setTimeout(renderAll, 90); });
    window.addEventListener('budgetit:recap-seen', () => setTimeout(renderAll, 50));
    document.addEventListener('click', e => { if (e.target.closest('[data-page="analytics-page"]')) setTimeout(renderAll, 160); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });
    setTimeout(renderAll, 600);
    return renderAll;
}
