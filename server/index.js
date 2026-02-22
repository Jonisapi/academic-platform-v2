import express from 'express';
import cors from 'cors';
import multer from 'multer';

const app = express();
const port = 8787;
const OPENAI_API_KEY = '';
```

Press **Ctrl+S**, then:
```
git add .
git commit -m "Remove hardcoded API key from server"
git push origin main
const upload = multer({ storage: multer.memoryStorage() });

const corpus = [];

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/text', (req, res) => {
  const { name, text } = req.body ?? {};
  if (!text?.trim()) return res.status(400).json({ success: false, error: 'No text provided' });
  const doc = { id: `${Date.now()}`, name: name || 'Document', text };
  corpus.push(doc);
  console.log(`Added: ${doc.name} (${doc.text.length} chars)`);
  res.json({ success: true, document: { id: doc.id, name: doc.name, size: doc.text.length, uploadedAt: new Date().toISOString() } });
});

app.delete('/api/documents', (_req, res) => {
  corpus.length = 0;
  res.json({ success: true });
});

app.post('/api/query', async (req, res) => {
  const { prompt, strictQuotesOnly = true } = req.body ?? {};
  if (!prompt?.trim()) return res.status(400).json({ success: false, error: 'Prompt is required' });
  if (!corpus.length) return res.json({ success: true, answer: 'No documents loaded. Please paste your text first.', quotes: [] });

  const context = corpus.map(d => `--- ${d.name} ---\n${d.text.slice(0, 15000)}`).join('\n\n');

  const systemPrompt = strictQuotesOnly
    ? `You are a strict academic assistant. Answer ONLY with exact quotes from the documents below.
Format your response as:
[1] "exact quote from document" (source name, p. X)
[2] "exact quote from document" (source name, p. X)
[3] "exact quote from document" (source name, p. X)

Then add this JSON block at the end:
QUOTES_JSON:{"quotes":[{"id":"q1","quote":"exact text","source":"name","page":1,"score":0.95},{"id":"q2","quote":"exact text","source":"name","page":2,"score":0.90},{"id":"q3","quote":"exact text","source":"name","page":3,"score":0.85}]}

Preserve Hebrew text exactly as it appears. If no relevant evidence found, say: "Insufficient evidence."`
    : `You are an academic assistant. Answer using only the provided documents. Cite sources inline.
Then add: QUOTES_JSON:{"quotes":[{"id":"q1","quote":"text","source":"name","page":1,"score":0.90}]}
Preserve Hebrew text exactly.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 2000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Documents:\n\n${context}\n\nQuestion: ${prompt}` }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'OpenAI error');

    const fullText = data.choices[0].message.content || '';
    let quotes = [];
    const jsonMatch = fullText.match(/QUOTES_JSON:(\{"quotes":\[.*?\]\})/s);
    if (jsonMatch) {
      try { quotes = JSON.parse(jsonMatch[1]).quotes || []; } catch (e) {}
    }
    const answer = fullText.replace(/QUOTES_JSON:\{.*?\}/s, '').trim();
    res.json({ success: true, answer, quotes });
  } catch (err) {
    console.error('OpenAI error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(port, () => console.log(`API running on http://localhost:${port}`));
