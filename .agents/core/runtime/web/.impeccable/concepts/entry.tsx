import { createRoot } from 'react-dom/client';
import { App } from '../../src/app';
import '../../src/styles.css';
import './concepts.css';
const look = new URLSearchParams(location.search).get('look');
document.documentElement.dataset.concept = ['paper', 'stone', 'night'].includes(look ?? '') ? look! : 'stone';
createRoot(document.getElementById('root')!).render(<App />);
