import {forwardRef,useEffect,useState} from 'react';
import {useValue,cx} from '../primitives/state';
import {useWindowContext} from '../window-context';
import {Button} from '../button';
import {Select} from '../select';
import {ControlIcon} from '../primitives/control-icons';
import type {PaginationProps} from './navigation-controls';
type PageToken=number|'before'|'after';
/** Keep a full early/late range, replacing distant ranges with five-page actions. */
function pageTokens(current:number,pages:number):PageToken[]{
 if(pages<=7)return Array.from({length:pages},(_,index)=>index+1);
 let start=Math.max(1,current-2),end=Math.min(pages,current+2);if(current<=3)end=5;if(current>=pages-2)start=pages-4;
 const before=current>=5&&current!==3,after=pages-current>=4&&current!==pages-2;
 if(before&&end!==pages)start++;if(after&&start!==1)end--;
 const result:PageToken[]=Array.from({length:end-start+1},(_,index)=>start+index);
 if(before)result.unshift('before');if(after)result.push('after');if(start!==1)result.unshift(1);if(end!==pages)result.push(pages);return result;
}
export const Pagination=forwardRef<HTMLElement,PaginationProps>(function Pagination({total,page,defaultPage=1,onPageChange,pageSize,defaultPageSize=10,onPageSizeChange,pageSizes=[10,20,50,100],showSizeChanger,showQuickJumper=false,compact=false,disabled=false,label='分页',align='start',size:controlSize='medium',showTotal=false,previousLabel,nextLabel,renderPage,className='',...props},ref){
 const [stored,setPage]=useValue(page,defaultPage,onPageChange),[size,setSize]=useValue(pageSize,defaultPageSize,onPageSizeChange),[jump,setJump]=useState(''),context=useWindowContext(),unavailable=disabled||!context.active||!context.enabled;
 const safeSize=Number.isFinite(size)&&size>0?Math.floor(size):10,count=Number.isFinite(total)&&total>0?Math.floor(total):0,pages=Math.max(1,Math.ceil(count/safeSize)),current=Number.isFinite(stored)?Math.max(1,Math.min(pages,Math.floor(stored))):1,[simple,setSimple]=useState(String(current));
 useEffect(()=>setSimple(String(current)),[current]);useEffect(()=>{if(unavailable){setJump('');setSimple(String(current));}},[unavailable]);
 const change=(requested:number)=>{if(unavailable||!Number.isFinite(requested))return;const next=Math.max(1,Math.min(pages,Math.floor(requested)));setSimple(String(next));if(next!==current)setPage(next);};
 const commit=(value:string)=>{if(value.trim()&&/^\d+$/.test(value.trim()))change(Number(value));else setSimple(String(current));};
 const range={from:count?(current-1)*safeSize+1:0,to:Math.min(count,current*safeSize),total:count},changer=showSizeChanger??count>50;
 return <nav {...props} ref={ref} aria-label={label} className={cx('ksf-pagination',className)} data-align={align} data-size={controlSize} data-disabled={unavailable||undefined}>
  {showTotal&&<span className="ksf-pagination-total">{typeof showTotal==='function'?showTotal(range):`共 ${count} 项`}</span>}
  <Button className="ksf-pagination-direction" wave={false} variant="text" size={controlSize==='small'?'small':'medium'} aria-label="上一页" disabled={unavailable||current<=1} onClick={()=>change(current-1)}>{previousLabel??<ControlIcon name="LeftOutlined"/>}</Button>
  {compact?<label className="ksf-pagination-simple"><input type="text" inputMode="numeric" aria-label="当前页码" disabled={unavailable} value={simple} onChange={event=>setSimple(event.target.value)} onBlur={()=>commit(simple)} onKeyDown={event=>{if(event.defaultPrevented||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;if(event.key==='Enter'){event.preventDefault();commit(simple);}else if(event.key==='Escape'){event.preventDefault();setSimple(String(current));}else if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();change(current+(event.key==='ArrowUp'?1:-1));}}}/><span>/</span>{pages}</label>:pageTokens(current,pages).map(value=>typeof value==='number'?<Button key={value} className="ksf-pagination-page" wave={false} size={controlSize==='small'?'small':'medium'} aria-label={`第${value}页`} aria-current={current===value?'page':undefined} disabled={unavailable||count===0} onClick={()=>change(value)}>{renderPage?renderPage(value,current===value):value}</Button>:<Button key={value} className="ksf-pagination-jump" wave={false} variant="text" size={controlSize==='small'?'small':'medium'} aria-label={value==='before'?'向前跳五页':'向后跳五页'} disabled={unavailable} onClick={()=>change(current+(value==='before'?-5:5))}><span className="ksf-pagination-ellipsis" aria-hidden="true">•••</span><ControlIcon className="ksf-pagination-jump-icon" name={value==='before'?'DoubleLeftOutlined':'DoubleRightOutlined'}/></Button>)}
  <Button className="ksf-pagination-direction" wave={false} variant="text" size={controlSize==='small'?'small':'medium'} aria-label="下一页" disabled={unavailable||current>=pages} onClick={()=>change(current+1)}>{nextLabel??<ControlIcon name="RightOutlined"/>}</Button>
  {(changer||showQuickJumper&&pages>1)&&<div className="ksf-pagination-options" data-size-changer={changer||undefined}>{changer&&<Select className="ksf-page-size" aria-label="每页条数" size={controlSize==='small'?'small':'medium'} value={String(safeSize)} disabled={unavailable} options={[...new Set([...pageSizes,safeSize])].filter(value=>Number.isInteger(value)&&value>0).sort((a,b)=>a-b).map(value=>({value:String(value),label:`${value} 条/页`}))} onValueChange={value=>{const nextSize=Number(value);if(unavailable||!Number.isInteger(nextSize)||nextSize<1)return;const nextPage=Math.min(current,Math.max(1,Math.ceil(count/nextSize)));setSize(nextSize);if(nextPage!==current)setPage(nextPage);}}/>}
  {showQuickJumper&&pages>1&&<label className="ksf-page-jump">前往<input className="ksf-page-input" type="text" inputMode="numeric" aria-label="跳至页码" value={jump} disabled={unavailable} onChange={event=>setJump(event.target.value)} onBlur={event=>{const next=event.relatedTarget as HTMLElement|null;if(jump&&!next?.closest('.ksf-pagination-page,.ksf-pagination-direction,.ksf-pagination-jump'))commit(jump);setJump('');}} onKeyDown={event=>{if(event.key==='Enter'&&!event.defaultPrevented&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229){event.preventDefault();commit(jump);setJump('');}else if(event.key==='Escape'){event.preventDefault();setJump('');}}}/>页</label>}</div>}
 </nav>;
});
