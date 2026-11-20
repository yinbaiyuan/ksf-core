import {useEffect,useId,useRef} from 'react';
import {Layers,PanelTop,MousePointerClick,Cpu,SquarePen,CalendarDays,ClipboardCheck,MapPin,Database,Images,ChartNoAxesCombined,PanelsTopLeft,Route,Puzzle,ChevronRight} from 'lucide-react';
import {Card} from '@ksf/sdk/card';
import {Button} from '@ksf/sdk/button';
import {Icon} from '@ksf/sdk/icon';
import {Heading,Text} from '@ksf/sdk/typography';
import {useWindowContext} from '@ksf/sdk/window-context';
import {componentGroups,type CatalogGroup} from './catalog';

const presentation:Record<string,{icon:typeof Layers;summary:string}>={
 foundation:{icon:Layers,summary:'颜色、文字、图标与按键表达。'},
 layout:{icon:PanelTop,summary:'空间组织、分栏、滚动与内容排布。'},
 actions:{icon:MousePointerClick,summary:'按钮、菜单与应用内命令。'},
 ai:{icon:Cpu,summary:'输入、模型、工具、上下文与会话。'},
 inputs:{icon:SquarePen,summary:'文本编辑、值选择与输入反馈。'},
 dates:{icon:CalendarDays,summary:'日期、时间与日历。'},
 forms:{icon:ClipboardCheck,summary:'字段组织、帮助与校验。'},
 navigation:{icon:MapPin,summary:'页面导航与内容定位。'},
 display:{icon:Database,summary:'列表、表格与内容呈现。'},
 media:{icon:Images,summary:'图片、附件与媒体预览。'},
 feedback:{icon:ChartNoAxesCombined,summary:'提示、结果、进度与用量。'},
 overlays:{icon:PanelsTopLeft,summary:'对话框、抽屉与辅助说明。'},
 flows:{icon:Route,summary:'步骤、分步内容与操作引导。'},
 extensions:{icon:Puzzle,summary:'按需接入专业交互与工具。'},
};

/** Pointer feedback belongs to this card's document and application window. */
function useCategoryTilt(){
 const root=useRef<HTMLElement>(null),context=useWindowContext();
 useEffect(()=>{
  const node=root.current,view=node?.ownerDocument.defaultView;
  if(!node||!view||!context.active||!context.enabled)return;
  const doc=node.ownerDocument,fine=view.matchMedia('(hover: hover) and (pointer: fine)'),reduce=view.matchMedia('(prefers-reduced-motion: reduce)');
  let frame:number|undefined,bounds:DOMRect|undefined,visible=true,focused=doc.hasFocus();
  const allowed=()=>fine.matches&&!reduce.matches&&!doc.hidden&&visible&&focused;
  const reset=()=>{
   if(frame!==undefined)view.cancelAnimationFrame(frame);
   frame=undefined;bounds=undefined;
   node.removeAttribute('data-tilt-active');
   node.style.removeProperty('--category-rotate-x');node.style.removeProperty('--category-rotate-y');
  };
  const update=()=>{node.toggleAttribute('data-tilt-enabled',allowed());if(!allowed())reset();};
  const move=(event:PointerEvent)=>{
   if(!allowed()||event.pointerType!=='mouse'){reset();return;}
   bounds??=node.getBoundingClientRect();
   const x=Math.max(-1,Math.min(1,(event.clientX-bounds.left)/bounds.width*2-1)),y=Math.max(-1,Math.min(1,(event.clientY-bounds.top)/bounds.height*2-1));
   if(frame!==undefined)view.cancelAnimationFrame(frame);
   frame=view.requestAnimationFrame(()=>{
    frame=undefined;
    node.style.setProperty('--category-rotate-x',`${(-y*2).toFixed(3)}deg`);
    node.style.setProperty('--category-rotate-y',`${(x*2).toFixed(3)}deg`);
    node.setAttribute('data-tilt-active','');
   });
  };
  const blur=()=>{focused=false;update();},focus=()=>{focused=true;update();};
  const observer=new view.IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;update();});
  observer.observe(node);update();
  node.addEventListener('pointermove',move);node.addEventListener('pointerleave',reset);node.addEventListener('pointercancel',reset);
  fine.addEventListener('change',update);reduce.addEventListener('change',update);doc.addEventListener('visibilitychange',update);
  view.addEventListener('blur',blur);view.addEventListener('focus',focus);view.addEventListener('resize',reset);
  return()=>{
   reset();node.removeAttribute('data-tilt-enabled');observer.disconnect();
   node.removeEventListener('pointermove',move);node.removeEventListener('pointerleave',reset);node.removeEventListener('pointercancel',reset);
   fine.removeEventListener('change',update);reduce.removeEventListener('change',update);doc.removeEventListener('visibilitychange',update);
   view.removeEventListener('blur',blur);view.removeEventListener('focus',focus);view.removeEventListener('resize',reset);
  };
 },[context.active,context.enabled]);
 return root;
}

export function CategoryCard({group,filtering,onSelect}:{group:CatalogGroup;filtering:boolean;onSelect:(id:string)=>void}){
 const id=useId(),root=useCategoryTilt(),details=presentation[group.id]??{icon:Layers,summary:group.scope},number=componentGroups.findIndex(g=>g.id===group.id)+1;
 return <Card ref={root} className="library-category-card" data-category-id={group.id} size="small" aria-labelledby={`${id}-title`}>
  <div className="library-category-mark" aria-hidden="true">
   <Text className="library-category-index">{String(number).padStart(2,'0')}</Text>
   <Icon className="library-category-icon" icon={details.icon} size={28}/>
  </div>
  <div className="library-category-heading">
   <Heading level={4} id={`${id}-title`} className="library-category-title">{group.label}</Heading>
   <Text id={`${id}-count`} className="library-category-count" size="caption" tone="muted">{group.items.length} {filtering?'项匹配':'项'}</Text>
   <Icon className="library-category-arrow" icon={ChevronRight} size={14}/>
  </div>
  <Text as="p" id={`${id}-summary`} className="library-category-summary" size="small" tone="muted">{details.summary}</Text>
  <Button variant="text" wave={false} className="library-category-entry" aria-labelledby={`${id}-title`} aria-describedby={`${id}-count ${id}-summary`} onClick={()=>onSelect(group.id)}>进入分类</Button>
 </Card>;
}
