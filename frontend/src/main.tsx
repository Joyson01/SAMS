import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@fontsource-variable/inter';
import './index.css';
import { ToastProvider } from './components/ui/Toast';
import { initializeTheme } from './components/ui/ThemeToggle';
initializeTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider><App /></ToastProvider>
  </React.StrictMode>,
);

