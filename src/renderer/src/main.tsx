import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './index.css';
import { initBrowserApi } from './browserApi.js';

// Initialize browser mock API if not running inside native Electron preload
initBrowserApi();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
