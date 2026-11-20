import type {HTMLAttributes,ReactNode} from 'react';
import './display.css';
export type ContentTone='neutral'|'primary'|'success'|'warning'|'danger'|'info';
export interface CardProps extends Omit<HTMLAttributes<HTMLElement>,'title'> {title?:ReactNode;description?:ReactNode;extra?:ReactNode;cover?:ReactNode;actions?:readonly ReactNode[];footer?:ReactNode;loading?:boolean;size?:'small'|'medium';bordered?:boolean;hoverable?:boolean;navigation?:ReactNode;appearance?:'default'|'inset';grid?:boolean}
export interface DescriptionItem {id:string;label:ReactNode;content:ReactNode;span?:number}
export interface DescriptionListProps extends HTMLAttributes<HTMLDListElement> {items:readonly DescriptionItem[];columns?:number;orientation?:'horizontal'|'vertical';bordered?:boolean;size?:'small'|'medium'|'large'}
export interface TagProps extends HTMLAttributes<HTMLSpanElement> {tone?:ContentTone;appearance?:'filled'|'outlined';icon?:ReactNode;onRemove?:()=>void;checkable?:boolean;selected?:boolean;defaultSelected?:boolean;onSelectedChange?:(selected:boolean)=>void;disabled?:boolean}
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {count?:number|string;max?:number;showZero?:boolean;dot?:boolean;tone?:ContentTone;status?:'default'|'processing'|'success'|'error'|'warning';text?:ReactNode;label?:string}
export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {name:string;src?:string;size?:number|'small'|'medium'|'large';shape?:'circle'|'square';icon?:ReactNode;text?:string;gap?:number}
export interface AvatarGroupProps extends HTMLAttributes<HTMLDivElement> {label:string;items:readonly AvatarProps[];max?:number;size?:number|'small'|'medium'|'large'}
export interface StatisticProps extends Omit<HTMLAttributes<HTMLDivElement>,'prefix'|'title'> {title:ReactNode;value:number|string;precision?:number;prefix?:ReactNode;suffix?:ReactNode;locale?:string;format?:(value:number|string)=>ReactNode;loading?:boolean}
export {Accordion} from './accordion-control';
export type {AccordionProps,AccordionItem} from './accordion-control';
export interface TimelineItem {id:string;title:ReactNode;content?:ReactNode;time?:ReactNode;tone?:ContentTone;icon?:ReactNode;loading?:boolean}
export interface TimelineProps extends HTMLAttributes<HTMLOListElement> {items:readonly TimelineItem[];pending?:ReactNode;reverse?:boolean;orientation?:'vertical'|'horizontal';placement?:'start'|'end'|'alternate';appearance?:'outlined'|'filled'}
export interface ListProps<T> extends Omit<HTMLAttributes<HTMLDivElement>,'children'> {label:string;items:readonly T[];getId:(item:T,index:number)=>string;renderItem:(item:T,index:number)=>ReactNode;empty?:ReactNode;groupBy?:(item:T)=>string;renderGroupTitle?:(group:string)=>ReactNode;stickyHeaders?:boolean;height?:number;virtual?:boolean;itemHeight?:number;overscan?:number;groupHeaderHeight?:number;bordered?:boolean;hoverable?:boolean;loading?:boolean}
export {List} from './list-control';
export {Card,DescriptionList,Tag,Badge,Avatar,AvatarGroup,Statistic,Timeline} from './data-presenters';
