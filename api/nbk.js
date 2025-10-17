const { withCORS } = require('./_cors.js');
const { DOMParser } = require('xmldom');

module.exports = withCORS(async (req, res) => {
  try {
    const symbols = (req.query.symbols || '')
      .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

    const r = await fetch('https://nationalbank.kz/rss/rates_all.xml');
    if (!r.ok) throw new Error('NBK upstream failed');
    const xml = await r.text();

    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const items = Array.from(doc.getElementsByTagName('item'));

    const rates = {};
    for (const it of items) {
      const code = it.getElementsByTagName('title')[0]?.textContent?.trim();
      const val  = Number(it.getElementsByTagName('description')[0]?.textContent?.trim().replace(',', '.'));
      if (!code || !val) continue;
      if (!symbols.length || symbols.includes(code)) rates[code] = { value: val, prev: null };
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=300');
    res.status(200).json({ base: 'KZT', rates });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});
