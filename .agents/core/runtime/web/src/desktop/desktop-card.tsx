import {WidgetFrame} from '../internal-ui/desktop';
import {useRef,type CSSProperties,type KeyboardEvent,type ReactNode} from 'react';
import {GlassSurface} from '../components/glass-surface';
import '../vendor/magic-bento/magic-bento.css';
import '../vendor/magic-bento/themes.css';
import './desktop-card.css';

export function DesktopCard({children,radius,editing,name,onKeyDown}:{children:ReactNode;radius:number;editing:boolean;name:string;onKeyDown:(event:KeyboardEvent<HTMLDivElement>)=>void}){
 const frame=useRef<HTMLDivElement>(null);
 return <WidgetFrame label={name} ref={frame} className="desktop-card-frame magic-bento__cell widget-drag-handle" data-bento-card tabIndex={editing?0:undefined} aria-label={editing?`用方向键移动${name}，按住 Shift 调整大小`:undefined} onKeyDown={onKeyDown} style={{'--desktop-card-radius':`${radius}px`} as CSSProperties}>
  <div className="magic-bento__card desktop-card-visual">
   <GlassSurface profile="dock" mode="native-frost" radius={radius}/>
   <span className="magic-bento__light" aria-hidden="true"/>
   <div className="magic-bento__content">{children}</div>
   <span className="magic-bento__rim" aria-hidden="true"/>
   <span className="magic-bento__border" aria-hidden="true"/>
  </div>
 </WidgetFrame>;
}
