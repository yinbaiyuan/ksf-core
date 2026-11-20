import {useCallback,useEffect,useRef,useState,type ForwardedRef,type RefObject} from 'react';
/** Controlled values belong to the application; an uncontrolled default is read once. */
export function useValue<T>(value:T|undefined,initial:T,onChange?: (value:T)=>void){
  const initialValue=useRef(initial);const [stored,setStored]=useState(initial),actual=value===undefined?stored:value,latest=useRef(actual);latest.current=actual;
  const set=(next:T|((previous:T)=>T))=>{const previous=latest.current;const result=typeof next==='function'?(next as (v:T)=>T)(previous):next;if(value===undefined){latest.current=result;setStored(result);}if(!Object.is(result,previous))onChange?.(result);};
  return [actual,set,()=>set(initialValue.current)] as const;
}
export const cx=(...parts:(string|false|null|undefined)[])=>parts.filter(Boolean).join(' ');

export function useElementRef<T>(forwarded:ForwardedRef<T>){const element=useRef<T|null>(null);const assign=useCallback((node:T|null)=>{element.current=node;if(typeof forwarded==='function'){const cleanup=(forwarded as (value:T|null)=>void|(()=>void))(node);if(typeof cleanup==='function')return()=>{element.current=null;cleanup();};}else if(forwarded)forwarded.current=node;},[forwarded]);return [element,assign] as const;}

/** Native form reset also restores uncontrolled component state after user onReset can cancel it. */
export function useFormReset(element:RefObject<HTMLElement|null>,enabled:boolean,reset:()=>void,formId?:string){const latest=useRef(reset);latest.current=reset;useEffect(()=>{const node=element.current;if(!enabled||!node)return;const form=(node as HTMLInputElement).form??node.closest('form');if(!form)return;let active=true;const handle=(event:Event)=>{queueMicrotask(()=>{if(active&&!event.defaultPrevented&&node.isConnected)latest.current();});};form.addEventListener('reset',handle);return()=>{active=false;form.removeEventListener('reset',handle);};},[element,enabled,formId]);}
