import React from 'react';
import Chat from './components/Chat.jsx';

export default function App() {
  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
      <h1>Llama Chat</h1>
      <Chat />
    </div>
  );
}