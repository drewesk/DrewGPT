import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Chat() {
  const [convId, setConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function initConversation() {
      try {
        const res = await fetch('/api/conversation', { method: 'POST' });
        const data = await res.json();
        setConvId(data.conversationId);
      } catch (err) {
        console.error('Failed to create conversation:', err);
      }
    }
    initConversation();
  }, []);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || !convId) return;
    setMessages((msgs) => [...msgs, { role: 'user', content }]);
    setInput('');
    try {
      const res = await fetch(`/api/conversation/${convId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      if (data.reply) {
        setMessages((msgs) => [...msgs, { role: 'assistant', content: data.reply }]);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  function copyTextFallback(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(textarea);
    }
  }

  const copyConversation = async () => {
    const text = messages
      .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'You'}: ${m.content}`)
      .join('\n');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        copyTextFallback(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      console.error('Failed to copy conversation:', e);
      alert('Failed to copy conversation.');
    }
  };

  return (
    <div>
      <div
        style={{
          minHeight: '300px',
          border: '1px solid #ccc',
          padding: '1rem',
          overflowY: 'auto',
          marginBottom: '1rem'
        }}
      >
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
              {m.role === 'assistant' ? 'Assistant' : 'You'}:
            </div>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSend();
            }
          }}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button onClick={handleSend} style={{ marginLeft: '0.5rem' }}>
          Send
        </button>
        <button
          onClick={copyConversation}
          aria-label="Copy conversation"
          title={copied ? 'Copied!' : 'Copy conversation'}
          style={{ marginLeft: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
    </div>
  );
}