/** Reference counted: replacing a sheet must not re-enable content still owned by another sheet. */
const locks = new WeakMap<HTMLElement, { users:number; wasInert:boolean }>();
export function suspendWindowContent(element:HTMLElement) {
  let lock=locks.get(element);
  if(!lock){lock={users:0,wasInert:element.inert};locks.set(element,lock);}
  lock.users++;element.inert=true;let released=false;
  return ()=>{if(released)return;released=true;if(!--lock.users){element.inert=lock.wasInert;locks.delete(element);}};
}
export function focusableElements(root:HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex],[contenteditable="true"]')].filter(element=>element.tabIndex>=0&&!element.matches(':disabled,[hidden]')&&!element.closest('[inert],[hidden]')&&element.getClientRects().length>0);
}
