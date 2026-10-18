import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { takeOmarchyColors } from './settings/omarchyColors';

takeOmarchyColors();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Offline reading (public/sw.js) is for the deployed app; in development it
// would serve yesterday's bundle.
if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
