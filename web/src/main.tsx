import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { PageSkeleton } from './components/ui/States.js';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <Suspense
      fallback={
        <div className="p-8">
          <PageSkeleton />
        </div>
      }
    >
      <App />
    </Suspense>
  </StrictMode>,
);
