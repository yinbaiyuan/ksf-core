import {useCallback,useRef,type Ref,type RefObject} from 'react';
/** Preserve React 19 callback cleanup as well as ordinary object and callback refs. */
export function useComposedRef<T>(internal:RefObject<T|null>,forwarded?:Ref<T>){
  const cleanup=useRef<void|(()=>void)>(undefined);
  return useCallback((node:T|null)=>{
    const previous=cleanup.current;cleanup.current=undefined;if(typeof previous==='function')previous();internal.current=node;
    if(typeof forwarded==='function'){if(node!==null||typeof previous!=='function')cleanup.current=forwarded(node);}
    else if(forwarded)forwarded.current=node;
  },[internal,forwarded]);
}
