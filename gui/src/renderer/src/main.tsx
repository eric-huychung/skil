import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './theme';
import { BridgeProvider } from './bridge-context';
import './styles/globals.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ThemeProvider>
      <BridgeProvider bridge={window.contextkit}>
        <App />
      </BridgeProvider>
    </ThemeProvider>
  </StrictMode>
);
