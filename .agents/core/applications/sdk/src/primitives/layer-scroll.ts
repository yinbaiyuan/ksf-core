type AnchorBox=Pick<DOMRectReadOnly,'left'|'top'|'width'|'height'>;
type Anchor=Pick<Element,'getBoundingClientRect'>;
type Surface=Pick<Node,'contains'>;

/** A queued scroll may arrive after opening; dismiss only if the anchor moved. */
export function trackLayerScroll(anchor:Anchor,panel:Surface,reposition:()=>void,close:()=>void,trigger?:Surface,isScrollAncestor:(target:Node|null)=>boolean=()=>true){
 let measured:AnchorBox=anchor.getBoundingClientRect();
 return {
  measured(box:AnchorBox){measured={left:box.left,top:box.top,width:box.width,height:box.height};},
  handle(event:Event){
   const target=event.target as Node|null;
   if(panel.contains(target)||trigger?.contains(target)){reposition();return;}
   if(!isScrollAncestor(target))return;
   const box=anchor.getBoundingClientRect();
   if(Math.abs(box.left-measured.left)>.5||Math.abs(box.top-measured.top)>.5||Math.abs(box.width-measured.width)>.5||Math.abs(box.height-measured.height)>.5)close();
  },
 };
}
