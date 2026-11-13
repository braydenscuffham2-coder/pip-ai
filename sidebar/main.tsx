import { createRoot } from 'react-dom/client';
import { IconSprite } from '@/components/icons';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<><IconSprite /><App /></>);
