import {forwardRef,useId} from 'react';
import type {LucideProps} from 'lucide-react';
import './app-store-icon.css';

/** One mark for the built-in store, including Dock, branding and window menus. */
export const AppStoreIcon=forwardRef<SVGSVGElement,LucideProps>(function AppStoreIcon({size=24,...props},ref){
  const id=useId().replace(/:/g,''),blue=`store-blue-${id}`,paper=`store-paper-${id}`;
  return <svg ref={ref} width={size} height={size} {...props} viewBox="0 0 64 64" fill="none" className={`app-store-mark ${props.className??''}`} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={blue} x1="12" y1="0" x2="48" y2="64" gradientUnits="userSpaceOnUse">
        <stop stopColor="#35BBFF"/><stop offset=".48" stopColor="#1688F7"/><stop offset="1" stopColor="#2259D9"/>
      </linearGradient>
      <linearGradient id={paper} x1="32" y1="23" x2="32" y2="52" gradientUnits="userSpaceOnUse">
        <stop stopColor="white"/><stop offset="1" stopColor="#E6F4FF"/>
      </linearGradient>
    </defs>
    <rect className="store-icon-plate" width="64" height="64" rx="18" fill={`url(#${blue})`}/>
    <rect className="store-icon-rim" x=".75" y=".75" width="62.5" height="62.5" rx="17.25" stroke="white" strokeOpacity=".28" strokeWidth="1.5"/>
    <path className="store-icon-handle" d="M24 25V21a8 8 0 0 1 16 0v4" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
    <path className="store-icon-bag" d="M21 23h22a3 3 0 0 1 3 2.7l2 20.8A5 5 0 0 1 43 52H21a5 5 0 0 1-5-5.5l2-20.8A3 3 0 0 1 21 23Z" fill={`url(#${paper})`}/>
    <g className="store-icon-tiles" fill="#1D7EE8">
      <rect x="24" y="32" width="6.5" height="6.5" rx="1.7"/>
      <rect x="33.5" y="32" width="6.5" height="6.5" rx="1.7"/>
      <rect x="24" y="41.5" width="6.5" height="6.5" rx="1.7"/>
      <rect x="33.5" y="41.5" width="6.5" height="6.5" rx="1.7"/>
    </g>
  </svg>;
});
