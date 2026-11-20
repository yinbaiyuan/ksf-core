interface Region {element:HTMLDivElement;ids:Set<string>}
const regions=new WeakMap<HTMLElement,Map<string,Region>>();
/** Layout belongs to one owner host; message state and callbacks remain in each React component. */
export function acquireToastRegion(host:HTMLElement,owner:string,id:string){
  let owners=regions.get(host);if(!owners){owners=new Map();regions.set(host,owners);}
  let region=owners.get(owner);
  if(!region){const element=host.ownerDocument.createElement('div');element.className='ksf-ui-toast-region';element.dataset.ksfUi='1';element.dataset.ksfToastOwner=owner;host.append(element);region={element,ids:new Set()};owners.set(owner,region);}
  if(region.ids.has(id))throw Error('同一owner不能同时展示重复的Toast id：'+id);
  region.ids.add(id);let disposed=false;const entry=region;
  return {element:entry.element,release(){if(disposed)return;disposed=true;entry.ids.delete(id);if(!entry.ids.size){entry.element.remove();if(owners.get(owner)===entry)owners.delete(owner);if(!owners.size)regions.delete(host);}}};
}
