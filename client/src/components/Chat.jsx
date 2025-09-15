import React, { useState, useEffect } from 'react';

// Chat component manages the chat conversation. It creates a new
// conversation on mount, sends user messages to the backend API, and
// displays the assistant's responses. It maintains an array of message
// objects in state and renders them in sequence.

export default function Chat() {
  const [convId, setConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  // On mount, create a new conversation. The backend returns a
  // conversationId, which is stored in state. This ID is used for
  // subsequent requests.
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

  // Send a user message and retrieve the assistant's reply
  const handleSend = async () => {
    const content = input.trim();
    if (!content || !convId) return;
    // Append the user's message to the local state immediately
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
          <div key={i} style={{ marginBottom: '0.5rem' }}>
            <strong>{m.role === 'assistant' ? 'Assistant' : 'You'}:</strong>{' '}
            {m.content}
          </div>
        ))}
      </div>
      <div>
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
          style={{ width: '80%' }}
        />
        <button onClick={handleSend} style={{ marginLeft: '0.5rem' }}>
          Send
        </button>
      </div>
    </div>
  );
}