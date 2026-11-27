const { put, list, del } = require('@vercel/blob');

// Versioned storage: every save writes a NEW file (data/v<ts>.json) and reads
// pick the newest by uploadedAt. (Overwriting one fixed URL left the public
// CDN cache serving stale content to the function's own fetch.)
const PREFIX = 'data/v';

async function readData() {
  try {
    const { blobs } = await list({ prefix: PREFIX });
    if (blobs && blobs.length) {
      const sorted = blobs.slice().sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      for (const b of sorted.slice(0, 3)) {
        try {
          const r = await fetch(b.url, { cache: 'no-store' });
          if (r.ok) {
            const d = await r.json();
            return { tools: Array.isArray(d.tools) ? d.tools : [], settings: (d.settings && typeof d.settings === 'object') ? d.settings : {} };
          }
        } catch (e) {}
      }
    }
    // legacy fallback: original single-file store
    const old = await list({ prefix: 'tools.json' });
    if (old.blobs && old.blobs.length) {
      const r = await fetch(old.blobs[0].url + '?v=' + Date.now(), { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        return { tools: Array.isArray(d.tools) ? d.tools : [], settings: (d.settings && typeof d.settings === 'object') ? d.settings : {} };
      }
    }
    return { tools: [], settings: {} };
  } catch (e) { return { tools: [], settings: {} }; }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
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
      url: /^https?:\/\//i.test(String(t.url || '')) ? String(t.url).slice(0, 1000) : '',
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
    await put(PREFIX + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.json', JSON.stringify({ tools: clean, settings }), { access: 'public', addRandomSuffix: false, contentType: 'application/json' });
    // prune old versions, keep the newest 3
    try {
      const { blobs } = await list({ prefix: PREFIX });
      if (blobs && blobs.length > 3) {
        const sorted = blobs.slice().sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
        const stale = sorted.slice(3).map(b => b.url);
        if (stale.length) await del(stale);
      }
    } catch (e) {}
    return res.status(200).json({ ok: true, count: clean.length, settings });
  }
  return res.status(405).json({ error: 'Method not allowed' });
};
