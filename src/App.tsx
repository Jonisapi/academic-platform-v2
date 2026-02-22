import { useState } from 'react';

type Provider = 'openai' | 'claude' | 'gemini';

interface Doc {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
  text: string;
}

interface Quote {
  id: string;
  quote: string;
  source: string;
  page: number;
  score: number;
}

async function callAI(provider: Provider, apiKey: string, systemPrompt: string, userMessage: string): Promise<string> {
  if (provider === 'openai') {
    const res = await fetch('/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 4000,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }]
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'OpenAI error');
    return data.choices[0].message.content || '';
  }

  if (provider === 'claude') {
    const res = await fetch('/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Claude error');
    return data.content[0].text || '';
  }

  if (provider === 'gemini') {
    const res = await fetch(`/gemini/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }],
        generationConfig: { maxOutputTokens: 4000 }
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Gemini error');
    return data.candidates[0].content.parts[0].text || '';
  }

  throw new Error('Unknown provider');
}

export default function App() {
  const [provider, setProvider] = useState<Provider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [pasteName, setPasteName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [strictMode, setStrictMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preferredQuote, setPreferredQuote] = useState('');

  const addText = () => {
    if (!pasteText.trim()) return;
    const doc: Doc = {
      id: `${Date.now()}`,
      name: pasteName.trim() || 'Document',
      size: pasteText.length,
      uploadedAt: new Date().toLocaleString(),
      text: pasteText
    };
    setDocs(prev => [...prev, doc]);
    setPasteText('');
    setPasteName('');
  };

  const clearAll = () => { setDocs([]); setAnswer(''); setQuotes([]); setPreferredQuote(''); };

  const onQuery = async () => {
    if (!prompt.trim() || !docs.length || !apiKey.trim()) return;
    setLoading(true); setError(''); setAnswer(''); setQuotes([]);

    try {
      const context = docs.map(d => `--- ${d.name} ---\n${d.text.slice(0, 8000)}`).join('\n\n');

      const systemPrompt = strictMode
        ? `You are a strict academic assistant. Answer ONLY with exact quotes from the documents.
Format:
[1] "exact quote" (document name, p. X)
[2] "exact quote" (document name, p. X)
[3] "exact quote" (document name, p. X)

End with:
QUOTES_JSON:{"quotes":[{"id":"q1","quote":"text","source":"doc name","page":1,"score":0.95},{"id":"q2","quote":"text","source":"doc name","page":2,"score":0.90},{"id":"q3","quote":"text","source":"doc name","page":3,"score":0.85}]}

Preserve Hebrew exactly. If no evidence: "Insufficient evidence."`
        : `You are an academic assistant. Answer using only the provided documents. Cite sources.
Preserve Hebrew exactly.
End with: QUOTES_JSON:{"quotes":[{"id":"q1","quote":"text","source":"doc name","page":1,"score":0.90}]}`;

      const fullText = await callAI(provider, apiKey, systemPrompt, `Documents:\n\n${context}\n\nQuestion: ${prompt}`);

      let parsedQuotes: Quote[] = [];
      const jsonMatch = fullText.match(/QUOTES_JSON:(\{"quotes":\[.*)/s);
      if (jsonMatch) {
        try {
          const raw = jsonMatch[1].replace(/\]\}.*$/s, ']}');
          parsedQuotes = JSON.parse(raw).quotes || [];
        } catch (e) { /* ignore */ }
      }
      setAnswer(fullText.replace(/QUOTES_JSON:.*$/s, '').trim());
      setQuotes(parsedQuotes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Query failed');
    } finally { setLoading(false); }
  };

  const providerLabels: Record<Provider, string> = { openai: 'OpenAI (GPT-4o)', claude: 'Claude (Anthropic)', gemini: 'Gemini (Google)' };
  const providerColors: Record<Provider, string> = { openai: '#10a37f', claude: '#d97706', gemini: '#4285f4' };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Arial, sans-serif', color: '#1e293b' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>

        <header style={{ borderBottom: '2px solid #1e293b', paddingBottom: 16, marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 26 }}>📚 Academic Source Platform</h1>
          <p style={{ margin: '6px 0 0', color: '#475569' }}>Paste Hebrew/English documents · Query · Get exact source-grounded quotes</p>
        </header>

        {/* API Settings */}
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>AI Provider & API Key</h2>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            {(['openai', 'claude', 'gemini'] as Provider[]).map(p => (
              <button key={p} onClick={() => setProvider(p)}
                style={{ padding: '8px 16px', borderRadius: 8, border: `2px solid ${provider === p ? providerColors[p] : '#cbd5e1'}`, background: provider === p ? providerColors[p] : '#fff', color: provider === p ? '#fff' : '#475569', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                {providerLabels[p]}
              </button>
            ))}
          </div>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={`Enter your ${providerLabels[provider]} API key...`}
            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '10px 12px', fontSize: 13, boxSizing: 'border-box' }}
          />
          {!apiKey.trim() && <p style={{ fontSize: 12, color: '#f59e0b', marginTop: 6 }}>⚠️ Enter your API key to run queries.</p>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24 }}>

          {/* LEFT */}
          <div>
            <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <h2 style={{ marginTop: 0, fontSize: 16 }}>Add Document Text</h2>
              <input value={pasteName} onChange={e => setPasteName(e.target.value)} placeholder="Document name (e.g. Article 1)"
                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 10px', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />
              <textarea value={pasteText} onChange={e => setPasteText(e.target.value)}
                placeholder="Paste your document text here (Hebrew or English)..." rows={8}
                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 10px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
              <button onClick={addText} disabled={!pasteText.trim()}
                style={{ marginTop: 8, width: '100%', padding: '10px', background: '#1e293b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer', opacity: !pasteText.trim() ? 0.6 : 1 }}>
                + Add to Corpus
              </button>
            </div>

            <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 16 }}>Corpus ({docs.length})</h2>
                {docs.length > 0 && <button onClick={clearAll} style={{ fontSize: 12, color: '#dc2626', border: 'none', background: 'none', cursor: 'pointer' }}>Clear all</button>}
              </div>
              {docs.length === 0
                ? <p style={{ color: '#94a3b8', fontSize: 13 }}>No documents yet.</p>
                : docs.map(doc => (
                  <div key={doc.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, marginBottom: 8, background: '#f8fafc' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{doc.name}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{doc.size.toLocaleString()} chars</div>
                    <button onClick={() => setDocs(d => d.filter(x => x.id !== doc.id))}
                      style={{ marginTop: 6, fontSize: 11, color: '#dc2626', border: 'none', background: 'none', cursor: 'pointer' }}>Remove</button>
                  </div>
                ))}
            </div>
          </div>

          {/* RIGHT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 16 }}>Query</h2>
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, color: '#475569' }}>
                  <input type="checkbox" checked={strictMode} onChange={e => setStrictMode(e.target.checked)} />
                  Strict Quote Mode
                </label>
              </div>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
                placeholder="Ask your question in Hebrew or English..."
                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: 10, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
              <button onClick={onQuery} disabled={loading || !prompt.trim() || docs.length === 0 || !apiKey.trim()}
                style={{ marginTop: 10, padding: '10px 20px', background: providerColors[provider], color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer', opacity: (loading || !prompt.trim() || docs.length === 0 || !apiKey.trim()) ? 0.6 : 1 }}>
                {loading ? 'Running...' : `🔍 Run Query with ${providerLabels[provider]}`}
              </button>
              {error && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 8 }}>{error}</p>}
            </div>

            <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12, padding: 20, minHeight: 150 }}>
              <h2 style={{ marginTop: 0, fontSize: 16 }}>Response</h2>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 14, fontFamily: 'inherit', lineHeight: 1.7, color: answer ? '#1e293b' : '#94a3b8' }}>
                {answer || 'No response yet. Add documents and run a query.'}
              </pre>
            </div>
          </div>
        </div>

        {/* Quotes */}
        <div style={{ marginTop: 24, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12, padding: 20 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Quote Candidates</h2>
          {quotes.length === 0
            ? <p style={{ color: '#94a3b8', fontSize: 14 }}>Run a query to see exact quote options.</p>
            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {quotes.map(q => (
                <div key={q.id} style={{ border: `2px solid ${preferredQuote === q.id ? providerColors[provider] : '#e2e8f0'}`, borderRadius: 10, padding: 14, background: preferredQuote === q.id ? '#f0f9ff' : '#f8fafc' }}>
                  <p style={{ margin: '0 0 10px', fontSize: 14, fontStyle: 'italic' }}>{q.quote}</p>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{q.source} · p.{q.page}</div>
                  <div style={{ fontSize: 12, color: '#16a34a', marginTop: 4 }}>Score: {(q.score * 100).toFixed(0)}%</div>
                  <button onClick={() => setPreferredQuote(q.id)}
                    style={{ marginTop: 10, padding: '6px 12px', fontSize: 12, background: preferredQuote === q.id ? providerColors[provider] : '#f0fdf4', border: `1px solid ${preferredQuote === q.id ? providerColors[provider] : '#86efac'}`, borderRadius: 6, cursor: 'pointer', color: preferredQuote === q.id ? '#fff' : '#16a34a' }}>
                    {preferredQuote === q.id ? '✓ Preferred Quote' : 'Set as preferred quote'}
                  </button>
                </div>
              ))}
            </div>
          }
        </div>

      </div>
    </div>
  );
}
