import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// Entry point for the React application. This mounts the App component into
// the #root element defined in index.html. Strict mode is enabled to
// highlight potential issues during development.

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);