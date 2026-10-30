import {useId,type ReactElement} from 'react';

type EmblemKind='meeting'|'brief'|'tasks'|'lan'|'monitor'|'manual'|'flywheel'|'knowledge'|'abilities';
const colors:Record<EmblemKind,[string,string]>={meeting:['#6B92FF','#3C51C8'],brief:['#FFBE58','#EC7134'],tasks:['#37CFB1','#087E6B'],lan:['#55CDFF','#2863D5'],monitor:['#314C63','#122536'],manual:['#55BFB8','#176C7D'],flywheel:['#5878EF','#293A91'],knowledge:['#4AC5A1','#19765F'],abilities:['#AB89F1','#6742B5']};

/** Original vector marks stay legible at desktop, Dock and status-bar sizes. */
function Emblem({kind}:{kind:EmblemKind}){
 const id='application-emblem-'+useId().replace(/:/g,''),[light,dark]=colors[kind];
 return <svg className="application-emblem" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
  <defs><linearGradient id={id} x1="12" y1="0" x2="48" y2="64" gradientUnits="userSpaceOnUse"><stop stopColor={light}/><stop offset="1" stopColor={dark}/></linearGradient></defs>
  <rect className="emblem-plate" width="64" height="64" rx="15" fill={`url(#${id})`}/>
  <path d="M0 0h64v28C44 37 20 24 0 38V0Z" fill="white" fillOpacity=".055"/>
  <rect className="emblem-rim" x=".75" y=".75" width="62.5" height="62.5" rx="14.25" stroke="white" strokeOpacity=".25" strokeWidth="1.5"/>
  {kind==='knowledge'&&<>
   <path d="m22 22 10-9 10 9" stroke="#D3FFED" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
   <circle cx="32" cy="12" r="3.5" fill="#F3FFF9"/>
   <circle cx="22" cy="22" r="3" fill="#D3FFED"/><circle cx="42" cy="22" r="3" fill="#D3FFED"/>
   <path d="M12 29c7-3 14-1 20 3 6-4 13-6 20-3v23c-7-3-14-1-20 3-6-4-13-6-20-3V29Z" fill="#075743" fillOpacity=".2"/>
   <path d="M12 26c7-3 14-1 20 3 6-4 13-6 20-3v23c-7-3-14-1-20 3-6-4-13-6-20-3V26Z" fill="#F3FFF9"/>
   <path d="M32 30v21M18 34l8 2M18 40l8 2M38 36l8-2M38 42l8-2" stroke="#55AD91" strokeWidth="2.1" strokeLinecap="round"/>
  </>}
  {kind==='abilities'&&<>
   <path d="M18 22h10v-2a4 4 0 0 1 8 0v2h10v10h2a4 4 0 0 1 0 8h-2v12H35v-2a4 4 0 0 0-8 0v2h-9V41h2a4 4 0 0 0 0-8h-2V22Z" fill="#3F237B" fillOpacity=".2"/>
   <path d="M18 19h10v-2a4 4 0 0 1 8 0v2h10v10h2a4 4 0 0 1 0 8h-2v12H35v-2a4 4 0 0 0-8 0v2h-9V38h2a4 4 0 0 0 0-8h-2V19Z" fill="#FAF7FF"/>
   <path d="m32 26 2 4 4 2-4 2-2 4-2-4-4-2 4-2 2-4Z" fill="#AC8BDD"/>
  </>}
  {kind==='flywheel'&&<>
   <circle cx="32" cy="33.5" r="19" fill="#172566" fillOpacity=".2"/>
   <circle cx="32" cy="32" r="18" stroke="#F4F8FF" strokeWidth="4"/>
   <path d="M32 32c-10-5-9-13 0-18M32 32c9-6 16-1 15.6 9M32 32c1 11-7 15-15.6 9" stroke="#F4F8FF" strokeWidth="3.5" strokeLinecap="round"/>
   <circle cx="32" cy="32" r="5.5" fill="#F4F8FF"/>
   <circle cx="32" cy="32" r="2.5" fill="#4865CE"/>
   <path d="M32 14a18 18 0 0 1 18 16" stroke="#7EF3D4" strokeWidth="4" strokeLinecap="round"/>
   <path d="m44.5 27 6 9 4.5-10" fill="#7EF3D4" stroke="#7EF3D4" strokeWidth="1" strokeLinejoin="round"/>
  </>}
  {kind==='manual'&&<>
   <rect x="16" y="13" width="34" height="43" rx="5" fill="#124B5B" fillOpacity=".24"/>
   <path d="M21 10h27a2 2 0 0 1 2 2v40H21a6 6 0 0 1-6-6V16a6 6 0 0 1 6-6Z" fill="#F5FFFD"/>
   <path d="M21 10h4v42h-4a6 6 0 0 1-6-6V16a6 6 0 0 1 6-6Z" fill="#C4F0E8"/>
   <path d="M21 47h29v10H21a5 5 0 0 1 0-10Z" fill="#E0F5EF"/>
   <path d="M35 10h9v20l-4.5-3-4.5 3V10Z" fill="#F4BC53"/>
   <path d="M31 36h12M31 41h8M22 53h23" stroke="#479B9D" strokeWidth="2.5" strokeLinecap="round"/>
  </>}
  {kind==='meeting'&&<>
   <path d="M18 13h21l9 9v28a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V17a4 4 0 0 1 4-4Z" fill="#182574" fillOpacity=".22"/>
   <path d="M20 10h20l8 8v29a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4Z" fill="#F7FAFF"/>
   <path d="M40 10v5a3 3 0 0 0 3 3h5" fill="#CBDAFF"/>
   <path d="M23 23h14M23 30h9M23 37h7" stroke="#6885D6" strokeWidth="2.8" strokeLinecap="round"/>
   <circle cx="43" cy="43" r="12" fill="#1CB8C5"/>
   <rect x="40" y="34.5" width="6" height="11" rx="3" fill="white"/>
   <path d="M37.5 41.5a5.5 5.5 0 0 0 11 0M43 47v4M40 51h6" stroke="white" strokeWidth="1.9" strokeLinecap="round"/>
  </>}
  {kind==='brief'&&<>
   <g stroke="#FFF3CE" strokeWidth="2.2" strokeLinecap="round"><path d="M44 7v3M55 12l-2 2M33 12l2 2M58 22h-3"/></g>
   <circle cx="44" cy="21" r="8" fill="#FFF0BA"/>
   <rect x="11" y="24" width="42" height="31" rx="5" fill="#9C3D19" fillOpacity=".19"/>
   <rect x="11" y="21" width="42" height="31" rx="5" fill="#FFFCF5"/>
   <rect x="17" y="27" width="11" height="11" rx="2" fill="#F2A048"/>
   <path d="M33 28h13M33 34h10M18 43h27" stroke="#C78143" strokeWidth="2.8" strokeLinecap="round"/>
  </>}
  {kind==='tasks'&&<>
   <rect x="15" y="17" width="34" height="39" rx="5" fill="#04574F" fillOpacity=".25"/>
   <rect x="15" y="14" width="34" height="39" rx="5" fill="#F4FFF9"/>
   <rect x="23" y="9" width="18" height="9" rx="4" fill="#B8F5DD"/>
   <rect x="27" y="12" width="10" height="2" rx="1" fill="#26A887"/>
   <g stroke="#199E80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 26 2.5 2.5L29 24M34 27h8M22 36l2.5 2.5L29 34M34 37h8"/></g>
   <rect x="22" y="44" width="5" height="5" rx="1.3" stroke="#64BDA5" strokeWidth="1.7"/>
   <path d="M34 46.5h8" stroke="#87CDBA" strokeWidth="2.5" strokeLinecap="round"/>
  </>}
  {kind==='lan'&&<>
   <path d="M29 29h19a7 7 0 0 1 7 7v9a7 7 0 0 1-7 7h-2l-7 5v-5H29a7 7 0 0 1-7-7v-9a7 7 0 0 1 7-7Z" fill="#174EA6" fillOpacity=".23"/>
   <path d="M30 26h18a7 7 0 0 1 7 7v9a7 7 0 0 1-7 7h-2l-7 5v-5h-9a7 7 0 0 1-7-7v-9a7 7 0 0 1 7-7Z" fill="#BDEFFF"/>
   <path d="M17 12h23a7 7 0 0 1 7 7v12a7 7 0 0 1-7 7H25l-9 6v-6a7 7 0 0 1-6-7V19a7 7 0 0 1 7-7Z" fill="white"/>
   <g fill="#398BDC"><circle cx="21" cy="25" r="2.3"/><circle cx="29" cy="25" r="2.3"/><circle cx="37" cy="25" r="2.3"/></g>
   <path d="M34 43h12" stroke="#4AA5D8" strokeWidth="2.5" strokeLinecap="round"/>
  </>}
  {kind==='monitor'&&<>
   <rect x="8" y="11" width="48" height="40" rx="6" fill="#102737" stroke="#6C8B9F" strokeWidth="1.2"/>
   <path d="M20 16v30M32 16v30M44 16v30M13 22h38M13 32h38M13 42h38" stroke="#355367" strokeWidth=".8"/>
   <path d="M13 34h8l5-12 8 21 7-14 4 5h6" stroke="#50E5B4" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
   <path d="M25 56h14" stroke="#9FBBCD" strokeWidth="3" strokeLinecap="round"/>
  </>}
 </svg>;
}

export const applicationEmblems:Record<string,()=>ReactElement>={knowledge:()=> <Emblem kind="knowledge"/>,abilities:()=> <Emblem kind="abilities"/>,flywheel:()=> <Emblem kind="flywheel"/>,manual:()=> <Emblem kind="manual"/>,meeting:()=> <Emblem kind="meeting"/>,brief:()=> <Emblem kind="brief"/>,tasks:()=> <Emblem kind="tasks"/>,lan:()=> <Emblem kind="lan"/>,monitor:()=> <Emblem kind="monitor"/>};
