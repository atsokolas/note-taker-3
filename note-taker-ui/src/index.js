import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App'; // This is your main React component file

// This line looks for the div in your index.html
const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);

// This line tells React to render your App inside that div
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
