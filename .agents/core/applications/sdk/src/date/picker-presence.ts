import {useLayoutEffect,useState} from 'react';
/** Keep a finite exit frame in its owner; disabled and reduced motion close immediately. */
export function usePickerPresence(open:boolean,enabled:boolean,element:{readonly current:HTMLElement|null}){
 const [present,setPresent]=useState(false);
 useLayoutEffect(()=>{if(!enabled){setPresent(false);return;}if(open){setPresent(true);return;}if(!present)return;const view=element.current?.ownerDocument.defaultView;if(!view){setPresent(false);return;}const media=view.matchMedia('(prefers-reduced-motion: reduce)');if(media.matches){setPresent(false);return;}const timer=view.setTimeout(()=>setPresent(false),200),finish=()=>{if(media.matches)setPresent(false);};media.addEventListener('change',finish);return()=>{view.clearTimeout(timer);media.removeEventListener('change',finish);};},[open,enabled,present,element]);
 return enabled&&(open||present);
}
