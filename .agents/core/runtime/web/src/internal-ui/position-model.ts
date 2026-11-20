export type OverlayPlacement='top'|'top-start'|'top-end'|'bottom'|'bottom-start'|'bottom-end'|'left'|'left-start'|'left-end'|'right'|'right-start'|'right-end';
export interface UIRect {left:number;top:number;width:number;height:number}
/** All coordinates are in the owner's local coordinate space, including its clipped viewport. */
export function placeOverlay(anchor:UIRect,panel:{width:number;height:number},boundary:UIRect,placement:OverlayPlacement,gap=6){
 const [requested,align='center']=placement.split('-'),opposite={top:'bottom',bottom:'top',left:'right',right:'left'} as const;
 let side=requested as keyof typeof opposite;
 const room={top:anchor.top-boundary.top-gap,bottom:boundary.top+boundary.height-anchor.top-anchor.height-gap,left:anchor.left-boundary.left-gap,right:boundary.left+boundary.width-anchor.left-anchor.width-gap};
 const needed=side==='top'||side==='bottom'?panel.height:panel.width;
 if(room[side]<needed&&room[opposite[side]]>room[side])side=opposite[side];
 const vertical=side==='top'||side==='bottom',cross=vertical?anchor.width:anchor.height,size=vertical?panel.width:panel.height;
 const offset=align==='start'?0:align==='end'?cross-size:(cross-size)/2;
 let left=vertical?anchor.left+offset:side==='left'?anchor.left-panel.width-gap:anchor.left+anchor.width+gap;
 let top=vertical?(side==='top'?anchor.top-panel.height-gap:anchor.top+anchor.height+gap):anchor.top+offset;
 left=Math.max(boundary.left,Math.min(left,boundary.left+boundary.width-panel.width));
 top=Math.max(boundary.top,Math.min(top,boundary.top+boundary.height-panel.height));
 return {left,top,side,maxWidth:boundary.width,maxHeight:boundary.height};
}
