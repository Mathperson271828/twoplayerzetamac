import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx'; // Correctly imports your App.jsx
import './index.css'; // Keep this line if index.css exists and is needed

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
