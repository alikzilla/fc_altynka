import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initializeTheme } from './lib/theme';
import '@fontsource-variable/onest';
import './styles/app.css';
import './styles/themes.css';

initializeTheme();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
