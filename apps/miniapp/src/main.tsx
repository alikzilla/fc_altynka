import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { queryClient } from './lib/queryClient';
import { initializeTheme } from './lib/theme';
import { trackInputMode } from './lib/inputMode';
import '@fontsource-variable/onest';
import './styles/app.css';
import './styles/themes.css';
import './styles/match.css';
import './styles/ratings.css';
import './styles/venues.css';
import './styles/statistics.css';

initializeTheme();
trackInputMode();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
