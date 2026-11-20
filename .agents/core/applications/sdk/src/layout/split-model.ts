export interface SplitConstraint {minSize?:number;maxSize?:number}
/** Allocate native pixel space from relative weights, preserving minima unless the container cannot fit them. */
export function allocateSplit(total:number,weights:readonly number[],constraints:readonly SplitConstraint[],collapsed:readonly boolean[]=[]):number[] {
  total=Math.max(0,total);
  const mins=constraints.map((p,i)=>collapsed[i]?0:Math.max(0,p.minSize??80));
  const minSum=mins.reduce((a,b)=>a+b,0);
  if(minSum>total)return mins.map(v=>v*total/minSum);
  const maxs=constraints.map((p,i)=>collapsed[i]?0:Math.max(mins[i],p.maxSize??Infinity));
  const result=constraints.map(()=>0),free=new Set(constraints.map((_,i)=>i).filter(i=>!collapsed[i]));
  let remaining=total;
  while(free.size){
    const sum=[...free].reduce((a,i)=>a+Math.max(0,weights[i]??1),0);
    const proposals=new Map([...free].map(i=>[i,sum>0?remaining*Math.max(0,weights[i]??1)/sum:remaining/free.size]));
    let constrained=false;
    for(const i of free){const value=proposals.get(i)!;if(value<mins[i]||value>maxs[i]){result[i]=Math.max(mins[i],Math.min(maxs[i],value));remaining-=result[i];free.delete(i);constrained=true;}}
    if(!constrained){for(const i of free)result[i]=Math.max(0,proposals.get(i)!);break;}
  }
  return result;
}
export function resizeSplitPair(sizes:readonly number[],index:number,delta:number,constraints:readonly SplitConstraint[]):number[]{
  const next=[...sizes],sum=sizes[index]+sizes[index+1];
  const a=constraints[index],b=constraints[index+1];
  const minA=Math.min(a.minSize??80,sizes[index]),minB=Math.min(b.minSize??80,sizes[index+1]);
  const low=Math.max(minA,sum-(b.maxSize??Infinity)),high=Math.min(a.maxSize??Infinity,sum-minB);
  next[index]=Math.max(low,Math.min(high,sizes[index]+delta));next[index+1]=sum-next[index];return next;
}
