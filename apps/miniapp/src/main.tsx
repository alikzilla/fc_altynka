import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import { App } from './App';
import { aroundNav } from './lib/pageTransition';
import { queryClient } from './lib/queryClient';
import { initializeTheme } from './lib/theme';
import { trackInputMode } from './lib/inputMode';
import { trackPrefetch } from './lib/prefetch';
import '@fontsource-variable/onest';
import './styles/app.css';
import './styles/themes.css';
import './styles/match.css';
import './styles/ratings.css';
import './styles/venues.css';
import './styles/statistics.css';
import './styles/transitions.css';

initializeTheme();
trackInputMode();
trackPrefetch();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router aroundNav={aroundNav}><App /></Router>
    </QueryClientProvider>
  </StrictMode>,
);
