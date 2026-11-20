import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedPose,projectedCorners,restPose} from '../src/desktop/card-motion-model.ts';

test('the card plane has its exact rest corners and independent planar translation',()=>{
 assert.deepEqual(projectedCorners(restPose(),200,100),[{x:-100,y:-50},{x:-100,y:50},{x:100,y:-50},{x:100,y:50}]);
 assert.deepEqual(projectedCorners({rx:0,ry:0,tx:3,ty:-2},200,100),[{x:-97,y:-52},{x:-97,y:48},{x:103,y:-52},{x:103,y:48}]);
});
test('hover and even spring overshoot remain within the stable tile and viewport budget',()=>{
 for(const width of [48,88,320,768,1440,1920])for(const height of [48,200,600])for(const margin of [0,1,6,12])for(const u of [-1,0,1])for(const v of [-1,0,1]){
  const box={width,height,left:margin,right:margin,top:margin,bottom:Math.min(6,margin)};
  for(const pose of [boundedPose({rx:-v*6,ry:u*6,tx:u*6,ty:v*6},box),boundedPose({rx:3*v,ry:3*u,tx:5*u,ty:5*v},box)]){
   assert.ok(Math.abs(pose.rx)<=6&&Math.abs(pose.ry)<=6&&Math.abs(pose.tx)<=6&&Math.abs(pose.ty)<=6);
   for(const point of projectedCorners(pose,width,height)){assert.ok(point.x>=-width/2-margin-.001&&point.x<=width/2+margin+.001);assert.ok(point.y>=-height/2-margin-.001&&point.y<=height/2+Math.min(6,margin)+.001);}
  }
 }
});
test('unconstrained desktop cards retain the original six degree and pixel targets',()=>{
 const target={rx:-6,ry:6,tx:6,ty:6};
 assert.deepEqual(boundedPose(target,{width:200,height:200,left:32,right:32,top:32,bottom:32}),target);
});
