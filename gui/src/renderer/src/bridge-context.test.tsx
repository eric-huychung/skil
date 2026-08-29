import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BridgeProvider } from './bridge-context';
import { ThemeProvider } from './theme';
import App from './App';

describe('BridgeProvider', () => {
  it('shows a visible error instead of a blank tree when the native bridge is missing', () => {
    render(
      <ThemeProvider>
        <BridgeProvider>
          <App />
        </BridgeProvider>
      </ThemeProvider>
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't start/i);
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Commands' })).not.toBeInTheDocument();
  });
});
