// AI tools endpoint — needs GROQ_API_KEY env var in Vercel (free at console.groq.com)
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.GROQ_API_KEY) return res.status(501).json({ error: 'AI_NOT_CONFIGURED' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const mode = body && body.mode === 'fix' ? 'fix' : 'caption';
  const text = String((body && body.text) || '').slice(0, 2000).trim();
  if (!text) return res.status(400).json({ error: 'Text is required' });
  const system = mode === 'caption'
    ? 'You write short, catchy social media captions. Reply with exactly 3 caption options, each on its own line, numbered 1-3, each with 3-5 relevant hashtags at the end. Mix English and Roman Urdu naturally if the topic suggests it. No extra commentary.'
    : 'You are a careful editor. Fix the grammar, spelling and punctuation of the user text and make the tone clean and natural. Keep the original language (English stays English, Roman Urdu stays Roman Urdu). Reply with ONLY the corrected text, nothing else.';
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: system }, { role: 'user', content: text }],
        temperature: 0.7, max_tokens: 700
      })
    });
    const d = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'AI provider error' });
    const result = d && d.choices && d.choices[0] && d.choices[0].message ? d.choices[0].message.content : '';
    return res.status(200).json({ result: String(result || '').trim() });
  } catch (e) {
    return res.status(502).json({ error: 'AI request failed' });
  }
};
