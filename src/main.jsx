import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initPopularityWeights } from '@/lib/crossBingoPlacement.js'

// Load strip-freq.json in the background at app boot so slotProbs are ready
// before the user first generates a bingo.
initPopularityWeights()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
