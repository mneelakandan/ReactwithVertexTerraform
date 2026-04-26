import React, { useState, useRef, useEffect } from 'react';
import './App.css';

// ── Config ────────────────────────────────────────────────────────────────────
// These are injected at runtime via environment variables (see .env / Cloud Run secrets)
const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);

function TypewriterText({ text, done }) {
  const [displayed, setDisplayed] = useState('');
  const idx = useRef(0);

  useEffect(() => {
    if (done) { setDisplayed(text); return; }
    idx.current = 0;
    setDisplayed('');
    const iv = setInterval(() => {
      idx.current += 2;
      setDisplayed(text.slice(0, idx.current));
      if (idx.current >= text.length) clearInterval(iv);
    }, 12);
    return () => clearInterval(iv);
  }, [text, done]);

  return <span>{displayed}<span className="cursor">▌</span></span>;
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [model, setModel]         = useState('gemini-1.5-flash');
  const [error, setError]         = useState(null);
  const bottomRef                 = useRef(null);
  const inputRef                  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { id: uid(), role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          model,
          history: messages.map(m => ({ role: m.role, content: m.text })),
        }),
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();

      setMessages(prev => [...prev, {
        id: uid(),
        role: 'assistant',
        text: data.response,
        model: data.model,
        tokens: data.usageMetadata,
        fresh: true,
      }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const clearChat = () => { setMessages([]); setError(null); };

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">◈</span>
            <span className="logo-text">VERTEX<em>CHAT</em></span>
          </div>
          <div className="model-selector">
            <label>MODEL</label>
            <select value={model} onChange={e => setModel(e.target.value)}>
              <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
              <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
              <option value="gemini-2.0-flash-001">Gemini 2.0 Flash</option>
            </select>
          </div>
        </div>
        <div className="header-right">
          {messages.length > 0 && (
            <button className="btn-ghost" onClick={clearChat}>CLEAR</button>
          )}
          <div className="status-dot" title="Connected" />
        </div>
      </header>

      {/* ── Messages ── */}
      <main className="messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">◈</div>
            <h2>Vertex AI via Cloud Run</h2>
            <p>Powered by Google Gemini · Deployed on Cloud Run · Built with React</p>
            <div className="chips">
              {['Explain quantum computing', 'Write a haiku about GCP', 'What is Cloud Run?'].map(q => (
                <button key={q} className="chip" onClick={() => { setInput(q); inputRef.current?.focus(); }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={msg.id} className={`message message--${msg.role}`}>
            <div className="message-label">
              {msg.role === 'user' ? 'YOU' : msg.model?.toUpperCase() || 'GEMINI'}
            </div>
            <div className="message-bubble">
              {msg.role === 'assistant' && msg.fresh
                ? <TypewriterText text={msg.text} done={i < messages.length - 1} />
                : msg.text}
            </div>
            {msg.tokens && (
              <div className="message-meta">
                ↳ {msg.tokens.promptTokenCount}↑ {msg.tokens.candidatesTokenCount}↓ tokens
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="message message--assistant">
            <div className="message-label">GEMINI</div>
            <div className="message-bubble">
              <span className="thinking">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="error-bar">
            ⚠ {error}
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* ── Input ── */}
      <footer className="input-area">
        <textarea
          ref={inputRef}
          className="input-box"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Message Gemini… (Enter to send, Shift+Enter for newline)"
          rows={1}
          disabled={loading}
        />
        <button
          className={`send-btn ${loading ? 'send-btn--loading' : ''}`}
          onClick={sendMessage}
          disabled={loading || !input.trim()}
        >
          {loading ? '◌' : '▶'}
        </button>
      </footer>
    </div>
  );
}
