import {forwardRef,useId} from 'react';
import type {LucideProps} from 'lucide-react';
import './ability-store-icon.css';

/** Shared mark for the ability store's desktop, Dock and navigation. */
export const AbilityStoreIcon=forwardRef<SVGSVGElement,LucideProps & {foreground?:boolean}>(function AbilityStoreIcon({size=24,foreground=false,...props},ref){
  const id=useId().replace(/:/g,''),violet=`ability-store-violet-${id}`,paper=`ability-store-paper-${id}`;
  return <svg ref={ref} width={size} height={size} {...props} viewBox="0 0 64 64" fill="none" className={`ability-store-mark ${props.className??''}`} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={violet} x1="12" y1="0" x2="48" y2="64" gradientUnits="userSpaceOnUse">
        <stop stopColor="#B780FF"/><stop offset=".48" stopColor="#9155E8"/><stop offset="1" stopColor="#6537C2"/>
      </linearGradient>
      <linearGradient id={paper} x1="32" y1="24" x2="32" y2="53" gradientUnits="userSpaceOnUse">
        <stop stopColor="white"/><stop offset="1" stopColor="#F0E7FF"/>
      </linearGradient>
    </defs>
    {!foreground&&<>
    <rect className="ability-store-plate" width="64" height="64" fill={`url(#${violet})`}/>
    <rect className="ability-store-rim" x=".75" y=".75" width="62.5" height="62.5" stroke="white" strokeOpacity=".28" strokeWidth="1.5"/>
    </>}
    <path className="ability-store-handle" d="M24 25V21a8 8 0 0 1 16 0v4" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
    <path className="ability-store-bag" d="M21 24h22a3 3 0 0 1 3 2.7l2 20.8A5 5 0 0 1 43 53H21a5 5 0 0 1-5-5.5l2-20.8A3 3 0 0 1 21 24Z" fill={`url(#${paper})`}/>
    <path className="ability-store-piece" d="M23 32h6v-1a2.5 2.5 0 0 1 5 0v1h6v6h1a2.5 2.5 0 0 1 0 5h-1v5h-6v-1a2.5 2.5 0 0 0-5 0v1h-6v-6h1a2.5 2.5 0 0 0 0-5h-1v-5Z" fill="#8750D7"/>
  </svg>;
});
