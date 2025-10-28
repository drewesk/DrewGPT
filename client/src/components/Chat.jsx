import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Chat() {
  const [convId, setConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPendingSend, setIsPendingSend] = useState(false);
  const queuedSendRef = useRef(null);
  const creatingConversationRef = useRef(false);

  // File upload state (attached to the next Send)
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef(null);

  // Set your backend URL here
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

  const initConversation = useCallback(async () => {
    if (creatingConversationRef.current) return;
    creatingConversationRef.current = true;

    try {
      const res = await fetch(`${API_BASE}/api/conversation`, { method: 'POST' });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to initialize conversation');
      }
      const data = await res.json();
      if (data?.conversationId) {
        setConvId(data.conversationId);
      } else {
        throw new Error('Invalid conversation response');
      }
    } catch (err) {
      console.error('Failed to create conversation:', err);
      if (queuedSendRef.current) {
        queuedSendRef.current = null;
        setIsPendingSend(false);
      }
      setIsLoading(false);
    } finally {
      creatingConversationRef.current = false;
    }
  }, [API_BASE]);

  useEffect(() => {
    initConversation();
  }, [initConversation]);

  // Allowed text/code file extensions for raw send (limit types)
  const ALLOWED_EXTENSIONS = [
    'txt','md','markdown','json','csv','js','ts','jsx','tsx','py','rb','go','java','c','cpp','cs','html','css','sh','yaml','yml','log'
  ];
  const SUPPORTED_FORMATS_LABEL = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(', ');

  const isAllowedFile = (file) => {
    if (!file) return false;
    const name = file.name || '';
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    if (ALLOWED_EXTENSIONS.includes(ext)) return true;
    // Fallback to MIME type check for generic text types
    if (file.type && (file.type.startsWith('text/') || file.type.includes('json') || file.type.includes('csv'))) return true;
    return false;
  };

  const handleFileChange = (e) => {
    setFileError('');
    const file = e.target.files && e.target.files[0];

    if (!file) {
      setSelectedFile(null);
      if (!convId && isPendingSend && queuedSendRef.current) {
        queuedSendRef.current = { ...queuedSendRef.current, file: null };
        const hasText = (queuedSendRef.current.textMessage || '').trim().length > 0;
        if (!hasText) {
          queuedSendRef.current = null;
          setIsPendingSend(false);
          setIsLoading(false);
        }
      }
      return;
    }

    if (!isAllowedFile(file)) {
      setSelectedFile(null);
      setFileError('Unsupported file type. Please choose a text/code file.');
      if (!convId && isPendingSend && queuedSendRef.current) {
        queuedSendRef.current = { ...queuedSendRef.current, file: null };
        const hasText = (queuedSendRef.current.textMessage || '').trim().length > 0;
        if (!hasText) {
          queuedSendRef.current = null;
          setIsPendingSend(false);
          setIsLoading(false);
        }
      }
      return;
    }

    const MAX_BYTES = 1024 * 1024; // 1MB default safety limit
    if (file.size > MAX_BYTES) {
      setSelectedFile(null);
      setFileError('File too large (max 1MB). Consider splitting the content.');
      if (!convId && isPendingSend && queuedSendRef.current) {
        queuedSendRef.current = { ...queuedSendRef.current, file: null };
        const hasText = (queuedSendRef.current.textMessage || '').trim().length > 0;
        if (!hasText) {
          queuedSendRef.current = null;
          setIsPendingSend(false);
          setIsLoading(false);
        }
      }
      return;
    }

    setSelectedFile(file);

    if (!convId && isPendingSend && queuedSendRef.current) {
      queuedSendRef.current = { ...queuedSendRef.current, file };
    }
  };

  const readFileAsText = useCallback((file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  }), []);

  const buildCombinedContent = useCallback(({ textMessage, file, fileText }) => {
    if (file && typeof fileText === 'string') {
      const name = file.name || 'attachment';
      const mime = file.type || 'text/plain';
      const ext = name.includes('.') ? name.split('.').pop() : '';
      return (
        `ATTACHMENT_BEGIN\n` +
        `filename: ${name}\n` +
        `type: ${mime}\n` +
        `extension: ${ext}\n` +
        `content:\n` +
        `${fileText}\n` +
        `ATTACHMENT_END\n\n` +
        (textMessage ? textMessage : '')
      );
    }
    return textMessage || '';
  }, []);

  const sendMessage = useCallback(async ({ textMessage, file }) => {
    if (!convId) return false;

    const sanitizedText = (textMessage || '').trim();
    const hasText = sanitizedText.length > 0;
    const hasFile = Boolean(file);

    if (!hasText && !hasFile) {
      return false;
    }

    setIsLoading(true);

    try {
      let fileText = null;
      if (file) {
        fileText = await readFileAsText(file);
      }

      if (hasText) {
        setMessages((msgs) => [...msgs, { role: 'user', content: sanitizedText }]);
      }

      const combined = buildCombinedContent({ textMessage: sanitizedText, file, fileText });

      const response = await fetch(`${API_BASE}/api/conversation/${convId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: combined })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to send message');
      }

      const data = await response.json();
      if (data.reply) {
        setMessages((msgs) => [...msgs, { role: 'assistant', content: data.reply }]);
      }

      setInput('');
      setSelectedFile(null);
      setFileError('');
      if (fileInputRef.current) {
        fileInputRef.current.value = null;
      }

      return true;
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages((msgs) => [...msgs, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE, convId, buildCombinedContent, readFileAsText]);

  const handleSend = async () => {
    const trimmedInput = (input || '').trim();
    const hasMessage = trimmedInput.length > 0;
    const hasFile = Boolean(selectedFile);
    if (!hasMessage && !hasFile) return;

    const payload = { textMessage: input, file: selectedFile };

    if (!convId) {
      queuedSendRef.current = payload;
      if (!isPendingSend) {
        setIsPendingSend(true);
        setIsLoading(true);
      }
      initConversation();
      return;
    }

    await sendMessage(payload);
  };

  useEffect(() => {
    if (!convId || !isPendingSend || !queuedSendRef.current) return;

    let cancelled = false;

    const flushQueuedMessage = async () => {
      const payload = queuedSendRef.current;
      await sendMessage(payload);
      if (cancelled) return;

      queuedSendRef.current = null;
      setIsPendingSend(false);
    };

    flushQueuedMessage();

    return () => {
      cancelled = true;
    };
  }, [convId, isPendingSend, sendMessage]);

  function copyTextFallback(text) {
    const textarea = document.createElement('textarea');
    // Explicitly set the text value without any encoding
    textarea.textContent = text;
    textarea.value = text;
    
    // Make it invisible but selectable
    textarea.style.position = 'fixed';
    textarea.style.left = '0';
    textarea.style.top = '0';
    textarea.style.opacity = '0';
    textarea.style.width = '1px';
    textarea.style.height = '1px';
    
    document.body.appendChild(textarea);
    
    // Select the text
    textarea.focus();
    textarea.select();
    
    let success = false;
    try {
      success = document.execCommand('copy');
    } catch (err) {
      console.error('Copy command failed:', err);
    }
    
    document.body.removeChild(textarea);
    return success;
  }
  
  function fallbackManualCopy(text) {
    // Create a visible textarea for manual copying as last resort
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      z-index: 10000;
      max-width: 90%;
      width: 500px;
    `;
    
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.cssText = `
      width: 100%;
      height: 200px;
      margin: 10px 0;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 5px;
      font-family: monospace;
    `;
    
    const label = document.createElement('p');
    label.textContent = 'Press Ctrl+C (or Cmd+C on Mac) to copy, then click Close:';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = `
      padding: 8px 16px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
    `;
    
    closeBtn.onclick = () => {
      document.body.removeChild(modal);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    
    modal.appendChild(label);
    modal.appendChild(textarea);
    modal.appendChild(closeBtn);
    document.body.appendChild(modal);
    
    textarea.select();
    textarea.focus();
  }

  const copyConversation = async () => {
    // Create raw text from messages without any encoding
    const rawText = messages
      .map((m) => {
        const role = m.role === 'assistant' ? 'Assistant' : 'You';
        // Ensure content is treated as plain text
        const content = String(m.content || '');
        return `${role}: ${content}`;
      })
      .join('\n\n');
    
    // Debug log to check the text
    console.log('Copying text:', rawText);
    
    try {
      // Use the modern clipboard API if available
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(rawText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        // Fallback method
        const success = copyTextFallback(rawText);
        if (success) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } else {
          throw new Error('Copy failed');
        }
      }
    } catch (e) {
      console.error('Failed to copy conversation:', e);
      // Last resort: create a temporary textarea for manual copying
      fallbackManualCopy(rawText);
    }
  };

  return (
    <div className="chat-container">
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="message" style={{ textAlign: 'center', opacity: 0.7 }}>
            <p>👋 Hello! I'm your Llama AI assistant. How can I help you today?</p>
          </div>
        ) : (
          <>
            {messages.map((m, i) => (
              <div key={i} className={`message ${m.role}`}>
                <div className={`message-role ${m.role}`}>
                  {m.role === 'assistant' ? '🤖 Assistant' : '👤 You'}
                </div>
                <div className="message-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="message assistant">
                <div className="message-role assistant">🤖 Assistant</div>
                <div className="message-content">
                  <div className="loading-dots">
                    <span className="loading-dot"></span>
                    <span className="loading-dot"></span>
                    <span className="loading-dot"></span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div className="input-container">
        <textarea
          className="chat-input"
          placeholder="Type your message here... (Shift+Enter for new line, Enter to send). Optional: attach a text/code file."
          value={input}
          onChange={(e) => {
            const value = e.target.value;
            setInput(value);
            if (!convId && isPendingSend) {
              const currentQueued = queuedSendRef.current || {};
              const hasText = value.trim().length > 0;
              const hasFile = Boolean(currentQueued.file || selectedFile);

              if (!hasText && !hasFile) {
                queuedSendRef.current = null;
                setIsPendingSend(false);
                setIsLoading(false);
              } else {
                queuedSendRef.current = { ...currentQueued, textMessage: value };
              }
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={3}
        />

        {/* Optional file attachment included with Send */}
        <div className="file-attach">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            aria-label="Attach a text/code file to include with your message"
            accept={ALLOWED_EXTENSIONS.map(ext => `.${ext}`).join(',')}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            title="Attach a text/code file"
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
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.7 17.53a2 2 0 1 1-2.83-2.83l8.48-8.48" />
            </svg>
            Attach File
          </button>
          <span className="file-hint">Supported formats: {SUPPORTED_FORMATS_LABEL}</span>

          {selectedFile && (
            <>
              <span className="file-name-badge">
                {selectedFile.name} ({Math.ceil(selectedFile.size/1024)} KB)
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setSelectedFile(null); setFileError(''); if (fileInputRef.current) fileInputRef.current.value = null; }}
                title="Remove attached file"
              >
                Remove
              </button>
            </>
          )}

          {fileError && (
            <span className="file-error">{fileError}</span>
          )}
        </div>

        <button 
          onClick={handleSend} 
          className="btn btn-primary"
          disabled={(!input.trim() && !selectedFile) || isLoading}
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
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
          Send
        </button>
        <button
          onClick={copyConversation}
          className={`btn btn-secondary ${copied ? 'copied' : ''}`}
          aria-label="Copy conversation"
          title={copied ? 'Copied!' : 'Copy conversation'}
          disabled={messages.length === 0}
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
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
    </div>
  );
}
