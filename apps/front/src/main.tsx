import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { BenchPage } from './BenchPage';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('No se encontró #root en index.html');

// `?bench=972` → página de benchmark (solo dev).
const benchCount = new URLSearchParams(window.location.search).get('bench');

if (benchCount !== null) {
  const count = Number.parseInt(benchCount, 10) || 972;
  createRoot(container).render(<BenchPage count={count} />);
} else {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
