import {Children,forwardRef,isValidElement,useLayoutEffect,useMemo,useRef,useState,type HTMLAttributes,type ReactNode} from 'react';
import {useElementRef} from '../primitives/state';
import {useWindowContext} from '../window-context';

export interface MasonryProps extends HTMLAttributes<HTMLDivElement> {columnWidth?:number;columns?:number;gap?:number}
type Entry={key:string;node:ReactNode;leaving?:boolean};
type Position={key:string;left:number;top:number;width:number};
type Geometry={width:number;height:number;positions:Position[]};

/** Keep DOM reading order while assigning each next card to the shortest column. */
export const Masonry=forwardRef<HTMLDivElement,MasonryProps>(function Masonry({columnWidth,columns,gap=0,children,className='',style,role='list',...props},ref){
  if(columns!==undefined&&(!Number.isInteger(columns)||columns<1))throw new RangeError('Masonry columns 必须为正整数。');
  if(columnWidth!==undefined&&(!Number.isFinite(columnWidth)||columnWidth<=0))throw new RangeError('Masonry columnWidth 必须大于0。');
  if(!Number.isFinite(gap)||gap<0)throw new RangeError('Masonry gap 不得小于0。');
  const [root,assign]=useElementRef(ref),context=useWindowContext();
  const incoming=useMemo(()=>Children.toArray(children).map((node,index)=>({key:String(isValidElement(node)?node.key??index:index),node})),[children]);
  const [entries,setEntries]=useState<Entry[]>(incoming),[geometry,setGeometry]=useState<Geometry|null>(null);
  const lastPositions=useRef(new Map<string,Position>());
  useLayoutEffect(()=>{
    setEntries(previous=>{
      const keys=new Set(incoming.map(item=>item.key));
      return [...incoming,...previous.filter(item=>!keys.has(item.key)).map(item=>({...item,leaving:true}))];
    });
  },[incoming]);
  useLayoutEffect(()=>{
    const node=root.current,view=node?.ownerDocument.defaultView;
    if(!node||!view||!entries.some(item=>item.leaving))return;
    const reduce=view.matchMedia('(prefers-reduced-motion: reduce)');
    const remove=()=>setEntries(previous=>previous.filter(item=>!item.leaving));
    if(!context.active||!context.enabled||reduce.matches){remove();return;}
    const timer=view.setTimeout(remove,100);reduce.addEventListener('change',remove,{once:true});
    return()=>{view.clearTimeout(timer);reduce.removeEventListener('change',remove);};
  },[entries,context.active,context.enabled,root]);
  useLayoutEffect(()=>{
    const node=root.current,view=node?.ownerDocument.defaultView;if(!node||!view)return;
    const measure=()=>{
      const width=node.clientWidth;if(!width)return;
      const count=columns??(columnWidth?Math.max(1,Math.floor((width+gap)/(columnWidth+gap))):3);
      const itemWidth=Math.max(0,(width-gap*(count-1))/count),bottoms=Array<number>(count).fill(0),positions:Position[]=[];
      const cards=Array.from(node.children) as HTMLElement[];
      for(const card of cards)card.style.width=`${itemWidth}px`;
      for(const item of entries){
        if(item.leaving)continue;
        const card=cards.find(card=>card.dataset.masonryKey===item.key);if(!card)continue;
        const column=bottoms.indexOf(Math.min(...bottoms)),top=bottoms[column];
        const position={key:item.key,left:column*(itemWidth+gap),top,width:itemWidth};
        positions.push(position);lastPositions.current.set(item.key,position);
        bottoms[column]=top+card.getBoundingClientRect().height+gap;
      }
      const height=Math.max(0,...bottoms)- (positions.length?gap:0);
      const next={width,height,positions};
      setGeometry(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
    };
    measure();
    const observer=new view.ResizeObserver(measure);observer.observe(node);for(const card of Array.from(node.children))observer.observe(card);
    return()=>observer.disconnect();
  },[entries,columns,columnWidth,gap,root]);
  const positions=new Map(geometry?.positions.map(position=>[position.key,position]));
  return <div {...props} ref={assign} role={role} className={`ksf-masonry ${className}`.trim()} data-ready={geometry?true:undefined} data-active={context.active&&context.enabled} style={{display:geometry?'block':'grid',gridTemplateColumns:`repeat(${columns??3},minmax(0,1fr))`,gap,...(geometry?{height:geometry.height}:{}),...style}}>
    {entries.map(item=>{const position=positions.get(item.key)??lastPositions.current.get(item.key);return <div key={item.key} data-masonry-key={item.key} data-leaving={item.leaving||undefined} aria-hidden={item.leaving||undefined} inert={item.leaving||undefined} role={role==='list'?'listitem':undefined} className="ksf-masonry-item" style={geometry&&position?{width:position.width,left:position.left,top:position.top}:undefined}>{item.node}</div>;})}
  </div>;
});
