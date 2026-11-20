import React from '../web/node_modules/react/index.js';
import {renderToStaticMarkup} from '../web/node_modules/react-dom/server.node.js';
import {Emblem,emblemColors} from '../web/src/apps/application-emblems';
import {AppStoreIcon} from '../web/src/apps/app-store-icon';
import {AbilityStoreIcon} from '../web/src/apps/ability-store-icon';
import {BookOpen,GitBranch,Grid2X2,LayoutGrid,Handshake,Terminal,Package,Activity,MessagesSquare} from '../web/node_modules/lucide-react/dist/cjs/lucide-react.js';
export const recipes=Object.fromEntries([
 ...Object.keys(emblemColors).map(key=>[key,{svg:renderToStaticMarkup(<Emblem kind={key as keyof typeof emblemColors} foreground/>),colors:emblemColors[key as keyof typeof emblemColors],angle:151}]),
 ['store',{svg:renderToStaticMarkup(<AppStoreIcon foreground/>),colors:['#35BBFF','#2259D9'],angle:151}],
 ['ability-store',{svg:renderToStaticMarkup(<AbilityStoreIcon foreground/>),colors:['#B780FF','#6537C2'],angle:151}],
 ['launcher',{svg:'<svg viewBox="0 0 64 64" fill="none">'+renderToStaticMarkup(<LayoutGrid size={34} x={15} y={15} color="#ffffff" strokeWidth={1.8}/>)+'</svg>',colors:['#8799B6','#546988'],angle:145}],
 ...[['documents',BookOpen,'#ffb95b','#ed832e'],['git',GitBranch,'#ff9173','#e45b3e'],['projects',Grid2X2,'#9c8af8','#6551ca'],['cooperation',Handshake,'#40b8d0','#3161c8'],['terminal',Terminal,'#202329','#202329'],['package',Package,'#f0f3f8','#e2e9f4'],['activity',Activity,'#f0f3f8','#e2e9f4'],['conversations',MessagesSquare,'#66b0ff','#1874df']].map(([key,Icon,light,dark])=>[key,{svg:'<svg viewBox="0 0 64 64" fill="none">'+renderToStaticMarkup(React.createElement(Icon,{size:34,x:15,y:15,strokeWidth:1.6,color:['package','activity'].includes(key as string)?'#6484ae':'#ffffff'}))+'</svg>',colors:[light,dark],angle:151}])
]);
