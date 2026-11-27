const { put, list } = require('@vercel/blob');

async function readData() {
  try {
    const { blobs } = await list({ prefix: 'tools.json' });
    if (!blobs || !blobs.length) return { tools: [], settings: {} };
    const sorted = blobs.slice().sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    const r = await fetch(sorted[0].url + '?v=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return { tools: [], settings: {} };
    const d = await r.json();
    return { tools: Array.isArray(d.tools) ? d.tools : [], settings: (d.settings && typeof d.settings === 'object') ? d.settings : {} };
  } catch (e) { return { tools: [], settings: {} }; }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    if (req.query && req.query.debug === '1' && req.headers['x-admin-key'] === process.env.ADMIN_KEY) {
      const { blobs } = await list({ prefix: 'tools.json' });
      const sorted = (blobs || []).slice().sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      let fetched = '';
      try { const fr = await fetch(sorted[0].url + '?v=' + Date.now(), { cache: 'no-store' }); fetched = (await fr.text()).slice(0, 200); } catch (e) { fetched = 'ERR ' + e.message; }
      return res.status(200).json({ blobs: (blobs || []).map(b => ({ pathname: b.pathname, uploadedAt: b.uploadedAt, size: b.size, url: b.url })), fetched });
    }
    return res.status(200).json(await readData());
  }
  if (req.method === 'POST') {
    if (!process.env.ADMIN_KEY) return res.status(503).json({ error: 'ADMIN_KEY not set' });
    if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Wrong admin key' });
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (body && body.verify) return res.status(200).json({ ok: true });
    const current = await readData();
    const clean = (Array.isArray(body && body.tools) ? body.tools : current.tools).slice(0, 100).map(t => ({
      id: String(t.id || ('custom-' + Date.now())),
      emoji: String(t.emoji || '🛠️').slice(0, 8),
      name: String(t.name || '').slice(0, 60),
      cat: String(t.cat || 'Custom').slice(0, 30),
      desc: String(t.desc || '').slice(0, 200),
      img: /^https?:\/\//i.test(String(t.img || '')) ? String(t.img).slice(0, 500) : '',
      custom: true
    })).filter(t => t.name && t.desc);
    let settings = current.settings || {};
    if (body && body.settings && typeof body.settings === 'object') {
      const bs = body.settings;
      settings = Object.assign({}, settings, {
        bgType: ['none', 'anim', 'video'].includes(bs.bgType) ? bs.bgType : (settings.bgType || 'none'),
        bgUrl: String(bs.bgUrl != null ? bs.bgUrl : (settings.bgUrl || '')).slice(0, 500),
        maintenance: bs.maintenance != null ? !!bs.maintenance : !!settings.maintenance,
        maintMsg: String(bs.maintMsg != null ? bs.maintMsg : (settings.maintMsg || '')).slice(0, 300),
        gaId: String(bs.gaId != null ? bs.gaId : (settings.gaId || '')).slice(0, 40),
        downloads: Array.isArray(bs.downloads) ? bs.downloads.slice(0, 50).map(d => ({
          name: String(d.name || '').slice(0, 80),
          url: /^https?:\/\//i.test(String(d.url || '')) ? String(d.url).slice(0, 500) : '',
          size: Number(d.size) || 0
        })).filter(d => d.name && d.url) : (Array.isArray(settings.downloads) ? settings.downloads : [])
      });
    }
    await put('tools.json', JSON.stringify({ tools: clean, settings }), { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
    return res.status(200).json({ ok: true, count: clean.length, settings });
  }
  return res.status(405).json({ error: 'Method not allowed' });
};
