import { createRoot } from 'react-dom/client'
import App from './ui/App'
import './ui/styles.css'

createRoot(document.getElementById('root')!).render(<App />)

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {})
