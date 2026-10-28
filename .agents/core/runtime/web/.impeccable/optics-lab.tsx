import { createRoot } from 'react-dom/client';
import { GlassSurface } from '../src/components/glass-surface';
import '../src/styles.css';
import '../src/material.css';
import './optics-lab.css';
createRoot(document.getElementById('root')!).render(<main><h1>折射验证：同心圆背景</h1><p>相同背景、相同模糊，只改变边缘位移。内部图形应连续，边缘曲率发生变化。</p><div className="samples">{[0, 26].map(strength => <section key={strength}><h2>{strength ? '边缘折射' : '仅模糊'}</h2><div className="optic-sample"><GlassSurface strength={strength} blur={.4} /></div></section>)}</div></main>);
