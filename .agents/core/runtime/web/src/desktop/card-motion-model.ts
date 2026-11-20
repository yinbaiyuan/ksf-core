export type Pose={rx:number;ry:number;tx:number;ty:number};
export type MotionBox={width:number;height:number;left:number;right:number;top:number;bottom:number};
export const restPose=():Pose=>({rx:0,ry:0,tx:0,ty:0});
export const cardPerspective=900;
export function projectedCorners(p:Pose,width:number,height:number){
 const x=p.rx*Math.PI/180,y=p.ry*Math.PI/180,cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y);
 return [-1,1].flatMap(a=>[-1,1].map(b=>{const u=a*width/2,v=b*height/2,z=v*sx-u*sy*cx,scale=cardPerspective/(cardPerspective-z);return {x:(u*cy+p.tx)*scale,y:(v*cx+u*sy*sx+p.ty)*scale};}));
}
export function boundedPose(p:Pose,box:MotionBox):Pose{
 p={rx:Math.max(-6,Math.min(6,p.rx)),ry:Math.max(-6,Math.min(6,p.ry)),tx:Math.max(-6,Math.min(6,p.tx)),ty:Math.max(-6,Math.min(6,p.ty))};
 const scale=(s:number):Pose=>({rx:p.rx*s,ry:p.ry*s,tx:p.tx*s,ty:p.ty*s});
 const fits=(q:Pose)=>projectedCorners(q,box.width,box.height).every(v=>v.x>=-box.width/2-Math.max(0,box.left)&&v.x<=box.width/2+Math.max(0,box.right)&&v.y>=-box.height/2-Math.max(0,box.top)&&v.y<=box.height/2+Math.max(0,box.bottom));
 if(fits(p))return p;
 let lo=0,hi=1;for(let i=0;i<12;i++){const mid=(lo+hi)/2;if(fits(scale(mid)))lo=mid;else hi=mid;}
 return scale(lo);
}
