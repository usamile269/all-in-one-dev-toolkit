const { put, list } = require('@vercel/blob');

async function readData() {
  try {
    const { blobs } = await list({ prefix: 'tools.json' });
    if (!blobs || !blobs.length) return { tools: [], settings: {} };
    const r = await fetch(blobs[0].url);
    if (!r.ok) return { tools: [], settings: {} };
    const d = await r.json();
    return { tools: Array.isArray(d.tools) ? d.tools : [], settings: (d.settings && typeof d.settings === 'object') ? d.settings : {} };
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
      custom: true
    })).filter(t => t.name && t.desc);
    let settings = current.settings || {};
    if (body && body.settings && typeof body.settings === 'object') {
      settings = {
        bgType: ['none', 'anim', 'video'].includes(body.settings.bgType) ? body.settings.bgType : 'none',
        bgUrl: String(body.settings.bgUrl || '').slice(0, 500)
      };
    }
    await put('tools.json', JSON.stringify({ tools: clean, settings }), { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
    return res.status(200).json({ ok: true, count: clean.length, settings });
  }
  return res.status(405).json({ error: 'Method not allowed' });
};
