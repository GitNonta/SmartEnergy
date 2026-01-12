import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './responsive.css';
import App from './App';
import { BUILD_VERSION } from './utils/versioning';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker only in production AND when explicitly enabled
// Disabled in dev to prevent stale cache and HMR conflicts on LAN
const swEnabled = import.meta.env.VITE_SW_ENABLED !== 'false';
if (import.meta.env.MODE === 'production' && swEnabled && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`/service-worker.js?v=${BUILD_VERSION}`).then(registration => {
      console.log('SW registered: ', registration);
      // Detect new updates
      registration.onupdatefound = () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('New version detected, requesting skipWaiting');
              newWorker.postMessage('SKIP_WAITING');
            }
          });
        }
      };
    }).catch(error => {
      console.log('SW registration failed: ', error);
    });
  });
  // Fire a custom event when new service worker takes control; UI can decide when to reload
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('Controller changed -> new version available');
    window.dispatchEvent(new CustomEvent('app.versionchange'));
  });
}

// Request persistent storage for mobile
if ('storage' in navigator && 'persist' in navigator.storage) {
  navigator.storage.persist().then(persistent => {
    console.log('Persistent storage:', persistent);
  }).catch(() => { });
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
