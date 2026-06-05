import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App' // CRITICAL: Must be a value import, not a type import
import './index.css'   // Connects your Tailwind CSS v4 styles

// This looks for the 'root' div in your index.html and injects the App
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)