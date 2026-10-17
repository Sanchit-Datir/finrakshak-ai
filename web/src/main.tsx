import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { PageSkeleton } from './components/ui/States.js';
import { initCloudAuth } from './state/cloud-auth.js';
import './styles.css';

// Restores a Firebase sign-in when this build has cloud settings; does nothing in plain demo mode.
initCloudAuth();

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
