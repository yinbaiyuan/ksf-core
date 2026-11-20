import {forwardRef,type CSSProperties,type HTMLAttributes,type ReactNode} from 'react';
import {cx} from '../primitives/state';
import './data-presenters.css';
export interface CardSummaryProps extends Omit<HTMLAttributes<HTMLDivElement>,'title'>{title?:ReactNode;description?:ReactNode;avatar?:ReactNode}
export const CardSummary=forwardRef<HTMLDivElement,CardSummaryProps>(function CardSummary({title,description,avatar,className,children,...props},ref){return <div {...props} ref={ref} className={cx('ksf-card-summary',className)}>{avatar!=null&&avatar!==false&&<div className="ksf-card-summary-avatar">{avatar}</div>}<div className="ksf-card-summary-copy">{title!=null&&title!==false&&<div className="ksf-card-summary-title">{title}</div>}{description!=null&&description!==false&&<div className="ksf-card-summary-description">{description}</div>}{children}</div></div>;});
export interface CardGridItemProps extends HTMLAttributes<HTMLDivElement>{width?:CSSProperties['width'];hoverable?:boolean}
export const CardGridItem=forwardRef<HTMLDivElement,CardGridItemProps>(function CardGridItem({width,hoverable=true,className,style,...props},ref){return <div {...props} ref={ref} className={cx('ksf-card-grid-item',className)} data-hoverable={hoverable||undefined} style={{width,...style}}/>;});
