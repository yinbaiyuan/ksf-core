/** Activity feedback for the application's own scrollers, including its Drawer. */
export function observeLibraryScrollbars(host:HTMLElement){
 const view=host.ownerDocument.defaultView;
 if(!view)return()=>{};
 const pending=new Map<HTMLElement,number>();
 const show=(event:Event)=>{
  const area=event.target;
  if(!(area instanceof view.HTMLElement)||!area.classList.contains('library-scroll-area'))return;
  view.clearTimeout(pending.get(area));
  area.setAttribute('data-scroll-active','');
  pending.set(area,view.setTimeout(()=>{
   area.removeAttribute('data-scroll-active');
   pending.delete(area);
  },800));
 };
 host.addEventListener('scroll',show,{capture:true,passive:true});
 return()=>{
  host.removeEventListener('scroll',show,true);
  for(const [area,timer]of pending){view.clearTimeout(timer);area.removeAttribute('data-scroll-active');}
  pending.clear();
 };
}
