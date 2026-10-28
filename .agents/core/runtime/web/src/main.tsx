import { createRoot } from 'react-dom/client';
import { Desktop } from './desktop/desktop';
import { MaterialProvider } from './components/material-provider';
import './styles.css';
import './material.css';
import 'react-grid-layout/css/styles.css';
import './desktop.css';
import './apps/app-store.css';
createRoot(document.getElementById('root')!).render(<MaterialProvider><Desktop /></MaterialProvider>);
