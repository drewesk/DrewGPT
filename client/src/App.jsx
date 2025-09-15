import React from 'react';
import Chat from './components/Chat.jsx';

// Top-level component for the chat application. It sets up some basic
// styling and renders the Chat component, which contains the chat UI.

export default function App() {
  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
      <h1>Llama Chat</h1>
      <Chat />
    </div>
  );
}