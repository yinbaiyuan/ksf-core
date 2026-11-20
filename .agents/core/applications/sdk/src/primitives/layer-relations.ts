interface LayerRecord {element:HTMLElement;trigger:HTMLElement;owner:unknown;parent?:LayerRecord}
const documents=new WeakMap<Document,Set<LayerRecord>>();
const active=(record:LayerRecord)=>record.element.isConnected&&!record.element.inert&&record.element.getAttribute('aria-hidden')!=='true';
const within=(record:LayerRecord,target:Node)=>record.element.contains(target)||record.trigger.contains(target);
function rootOf(record:LayerRecord){while(record.parent)record=record.parent;return record;}
function descendsFrom(record:LayerRecord,ancestor:LayerRecord){for(let item:LayerRecord|undefined=record;item;item=item.parent)if(item===ancestor)return true;return false;}
/** Logical portal families for the standalone fallback; records never cross owners. */
export function relateLayer(element:HTMLElement,trigger:HTMLElement,owner:unknown){
 const doc=element.ownerDocument,pool=documents.get(doc)??new Set<LayerRecord>();documents.set(doc,pool);
 const parent=[...pool].reverse().find(item=>item.owner===owner&&active(item)&&item.element.contains(trigger));
 const record:LayerRecord={element,trigger,owner,parent};pool.add(record);
 return {
  contains(target:Node){return [...pool].some(item=>item.owner===owner&&active(item)&&descendsFrom(item,record)&&within(item,target));},
  receivesEscape(target:Node){if(!active(record)||[...pool].filter(item=>active(item)&&within(item,target)).at(-1)?.owner!==owner)return false;const root=rootOf(record),family=[...pool].filter(item=>item.owner===owner&&active(item)&&rootOf(item)===root);return family.at(-1)===record&&family.some(item=>within(item,target));},
  dispose(){pool.delete(record);for(const item of pool)if(item.parent===record)item.parent=record.parent;if(!pool.size)documents.delete(doc);},
 };
}
