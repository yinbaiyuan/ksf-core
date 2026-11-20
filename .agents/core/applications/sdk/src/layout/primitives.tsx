import {Children,Fragment,forwardRef,isValidElement,type CSSProperties,type HTMLAttributes,type ReactNode,type RefObject} from 'react';
import './layout.css';
export interface GridProps extends HTMLAttributes<HTMLDivElement> {columns?: number | string; minItemWidth?: number | string; gap?: CSSProperties['gap']}
export const Grid=forwardRef<HTMLDivElement,GridProps>(function Grid({columns,minItemWidth=220,gap=16,className='',style,...props},ref){
  if(typeof columns==='number'&&(!Number.isInteger(columns)||columns<1))throw new RangeError('Grid columns 必须为正整数。');
  return <div {...props} ref={ref} className={`ksf-grid ${className}`.trim()} style={{'--ksf-grid-min':typeof minItemWidth==='number'?`${minItemWidth}px`:minItemWidth,gridTemplateColumns:typeof columns==='number'?`repeat(${columns},minmax(0,1fr))`:columns,gap,...style} as CSSProperties}/>;
});
export interface GridItemProps extends HTMLAttributes<HTMLDivElement> {columnSpan?:number;rowSpan?:number}
export const GridItem=forwardRef<HTMLDivElement,GridItemProps>(function GridItem({columnSpan,rowSpan,className='',style,...props},ref){
  if([columnSpan,rowSpan].some(v=>v!==undefined&&(!Number.isInteger(v)||v<1)))throw new RangeError('GridItem 跨度必须为正整数。');
  return <div {...props} ref={ref} className={`ksf-grid-item ${className}`.trim()} style={{gridColumn:columnSpan?`span ${columnSpan}`:undefined,gridRow:rowSpan?`span ${rowSpan}`:undefined,...style}}/>;
});
export interface SpaceProps extends HTMLAttributes<HTMLDivElement> {direction?:'row'|'column';gap?:CSSProperties['gap'];align?:CSSProperties['alignItems'];wrap?:boolean;compact?:boolean;separator?:ReactNode}
export const Space=forwardRef<HTMLDivElement,SpaceProps>(function Space({direction='row',gap=8,align='center',wrap=true,compact=false,separator,children,className='',style,...props},ref){
  return <div {...props} ref={ref} className={`ksf-space ${className}`.trim()} data-compact={compact||undefined} data-direction={direction} style={{flexDirection:direction,gap:compact?0:gap,alignItems:align,flexWrap:wrap&&!compact?'wrap':'nowrap',...style}}>{Children.toArray(children).map((child,index)=><Fragment key={isValidElement(child)?child.key??index:index}>{index>0&&separator&&<span aria-hidden="true">{separator}</span>}{compact?child:<span className="ksf-space-item">{child}</span>}</Fragment>)}</div>;
});
export interface DividerProps extends HTMLAttributes<HTMLDivElement> {orientation?:'horizontal'|'vertical';decorative?:boolean;dashed?:boolean;variant?:'solid'|'dashed'|'dotted';labelPosition?:'start'|'center'|'end';plain?:boolean}
export const Divider=forwardRef<HTMLDivElement,DividerProps>(function Divider({orientation='horizontal',decorative=true,dashed=false,variant,labelPosition='center',plain=false,children,className='',...props},ref){return <div {...props} ref={ref} role={decorative?'presentation':'separator'} aria-hidden={decorative||undefined} aria-orientation={decorative?undefined:orientation} data-orientation={orientation} data-dashed={dashed||undefined} data-variant={variant??(dashed?'dashed':'solid')} data-label-position={labelPosition} data-plain={plain||undefined} className={`ksf-divider ${className}`.trim()}>{children&&<span>{children}</span>}</div>;});
export interface AppLayoutProps extends Omit<HTMLAttributes<HTMLDivElement>,'title'> {header?:ReactNode;sidebar?:ReactNode;footer?:ReactNode;sidebarWidth?:number;sidebarCollapsed?:boolean;sidebarLabel?:string}
export const AppLayout=forwardRef<HTMLDivElement,AppLayoutProps>(function AppLayout({header,sidebar,footer,sidebarWidth=200,sidebarCollapsed=false,sidebarLabel='应用导航',children,className='',style,...props},ref){return <div {...props} ref={ref} className={`ksf-app-layout ${className}`.trim()} style={style}>{header&&<header className="ksf-app-layout-header">{header}</header>}<div className="ksf-app-layout-body">{sidebar&&!sidebarCollapsed&&<aside aria-label={sidebarLabel} style={{width:sidebarWidth,maxWidth:'45%'}}>{sidebar}</aside>}<main>{children}</main></div>{footer&&<footer>{footer}</footer>}</div>;});
export interface AffixProps extends HTMLAttributes<HTMLDivElement> {offset?:number;edge?:'top'|'bottom';container?:RefObject<HTMLElement|null>;onPinnedChange?:(pinned:boolean)=>void}
export {Affix} from './affix-control';
export {Masonry} from './masonry-control';
export type {MasonryProps} from './masonry-control';
/** Native scrolling is also useful inside layouts; it does not intercept wheel/touch events. */
export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {label:string;orientation?:'vertical'|'horizontal'|'both'}
export const ScrollArea=forwardRef<HTMLDivElement,ScrollAreaProps>(function ScrollArea({label,orientation='vertical',className='',tabIndex=0,...props},ref){return <div aria-label={label} {...props} ref={ref} role="region" tabIndex={tabIndex} className={`ksf-scroll-area ${className}`.trim()} data-orientation={orientation}/>;});
