import React, { useState, useEffect } from 'react';
import Chat from './components/Chat.jsx';
import './styles.css';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  
  const CORRECT_PASSWORD = 'Pass123@';
  const MAX_ATTEMPTS = 5;
  
  // Check if already authenticated in session
  useEffect(() => {
    const auth = sessionStorage.getItem('llama-chat-auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);
  
  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    
    if (attempts >= MAX_ATTEMPTS) {
      setError('Too many failed attempts. Please refresh the page.');
      return;
    }
    
    if (password === CORRECT_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem('llama-chat-auth', 'true');
      setError('');
    } else {
      setAttempts(prev => prev + 1);
      setError(`Incorrect password. ${MAX_ATTEMPTS - attempts - 1} attempts remaining.`);
      setPassword('');
    }
  };
  
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handlePasswordSubmit(e);
    }
  };
  
  if (!isAuthenticated) {
    return (
      <div className="app-container">
        <div className="auth-overlay">
          <div className="auth-modal">
            <div className="auth-icon">🔒</div>
            <h2 className="auth-title">Authentication Required</h2>
            <p className="auth-subtitle">Please enter the password to access Llama Chat</p>
            
            <form onSubmit={handlePasswordSubmit} className="auth-form">
              <input
                type="password"
                className="auth-input"
                placeholder="Enter password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={attempts >= MAX_ATTEMPTS}
                autoFocus
              />
              
              {error && (
                <div className="auth-error">
                  {error}
                </div>
              )}
              
              <button 
                type="submit" 
                className="btn btn-primary auth-button"
                disabled={!password || attempts >= MAX_ATTEMPTS}
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
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                Unlock Chat
              </button>
            </form>
            
            <div className="auth-hint">
              {attempts > 2 && attempts < MAX_ATTEMPTS && (
                <p className="hint-text">💡 Hint: Check with the administrator</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="app-title">🦙 Drew-Llama-Chat</h1>
        <p className="app-subtitle">Your AI-Powered Assistant</p>
        <button 
          className="logout-button"
          onClick={() => {
            sessionStorage.removeItem('llama-chat-auth');
            setIsAuthenticated(false);
            setPassword('');
            setAttempts(0);
          }}
          title="Lock Chat"
        >
          🔒
        </button>
      </header>
      <Chat />
    </div>
  );
}
