const { withCORS } = require('./_cors.js');
const { DOMParser } = require('xmldom');

module.exports = withCORS(async (req, res) => {
  try {
    const symbols = (req.query.symbols || '')
      .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

    const r = await fetch('https://www.nbkr.kg/XML/daily.xml');
    if (!r.ok) throw new Error('NBKR upstream failed');
    const xml = await r.text();

    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const nodes = Array.from(doc.getElementsByTagName('Currency'));

    const rates = {};
    for (const n of nodes) {
      const code = n.getAttribute('ISOCode');
      const val  = Number(n.getElementsByTagName('Value')[0]?.textContent?.trim().replace(',', '.'));
      if (!code || !val) continue;
      if (!symbols.length || symbols.includes(code)) rates[code] = { value: val, prev: null };
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=300');
    res.status(200).json({ base: 'KGS', rates });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});
