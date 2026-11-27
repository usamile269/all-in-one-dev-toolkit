// Download file upload — admin only, stores file in Vercel Blob, returns public URL
const { put } = require('@vercel/blob');
const TYPES = { pdf: 'application/pdf', zip: 'application/zip', txt: 'text/plain', apk: 'application/vnd.android.package-archive', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4', json: 'application/json', md: 'text/markdown' };
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ADMIN_KEY) return res.status(503).json({ error: 'ADMIN_KEY not set' });
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Wrong admin key' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const filename = String((body && body.filename) || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const data = String((body && body.data) || '');
  if (!data) return res.status(400).json({ error: 'No file data' });
  const buf = Buffer.from(data, 'base64');
  if (!buf.length) return res.status(400).json({ error: 'Empty file' });
  if (buf.length > 3.5 * 1024 * 1024) return res.status(413).json({ error: 'File too large (max ~3.5 MB)' });
  const ext = (filename.split('.').pop() || '').toLowerCase();
  try {
    const blob = await put('downloads/' + Date.now() + '-' + filename, buf, { access: 'public', contentType: TYPES[ext] || 'application/octet-stream' });
    return res.status(200).json({ url: blob.url, size: buf.length });
  } catch (e) {
    return res.status(502).json({ error: 'Upload failed' });
  }
};
