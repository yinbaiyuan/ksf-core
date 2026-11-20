type Gesture={owner:string;cancelled:boolean;restore:()=>void};
/** One native pointer gesture at a time. Geometry cancellation precedes overlay Escape. */
export class WindowGeometryInteractions {
 private current:Gesture|null=null;
 begin(owner:string,restore:()=>void){
  if(this.current&&!this.current.cancelled){this.current.cancelled=true;this.current.restore();}
  const gesture:Gesture={owner,cancelled:false,restore};this.current=gesture;
  return {get cancelled(){return gesture.cancelled;},restore,
   finish:()=>{if(this.current===gesture)this.current=null;return gesture.cancelled;}};
 }
 escape(event:KeyboardEvent,activeOwner:string|null):boolean{
  const gesture=this.current;if(!gesture||gesture.owner!==activeOwner||event.key!=='Escape'||event.isComposing||event.keyCode===229||event.defaultPrevented)return false;
  event.preventDefault();event.stopImmediatePropagation();if(!gesture.cancelled){gesture.cancelled=true;gesture.restore();}return true;
 }
}
export const windowGeometry=new WindowGeometryInteractions();
