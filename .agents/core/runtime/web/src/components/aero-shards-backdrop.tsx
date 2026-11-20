import {useState} from 'react';
import AeroShards from '../vendor/aero-shards/aero-shards';
import {useHostTheme} from './host-theme';
import './aero-shards-backdrop.css';

// A deterministic, static glacier ribbon also covers loading and GPU failures.
const shards=Array.from({length:240},(_,i)=>{
  const hash=(n:number)=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
  const t=hash(i+1),depth=i%5,size=5+hash(i+7)*18;
  const x=1130+Math.sin(t*6.28)*140+(hash(i+13)-.5)*420;
  const y=t*1080-90;
  return {points:`${x},${y-size} ${x+size*.75},${y-size*.2} ${x+size*.35},${y+size} ${x-size*.7},${y+size*.1}`,opacity:(.2+hash(i+19)*.5)/(1+depth*.28)};
});

export default function AeroShardsBackdrop({graphics,motion}:{graphics:boolean;motion:boolean}){
  const light=useHostTheme()==='host-theme-light';
  const [failed,setFailed]=useState(false);
  return <div className="aero-backdrop" data-preset="glacier" data-placement="right">
    <svg className="aero-fallback" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true">
      <g>{shards.map((shard,i)=><polygon key={i} points={shard.points} opacity={shard.opacity}/>)}</g>
      <path className="aero-fallback-markers" d="M830 180h12m-6-6v12 M1430 340h12m-6-6v12 M970 690h12m-6-6v12 M1250 790h12m-6-6v12"/>
    </svg>
    {graphics&&!failed&&<AeroShards shardColor="#9cc9ff" accentColor="#38bdf8" lightMode={light} backgroundColor="transparent" placement="right" material="glass" spread={1.2} speed={.8} intro={false} paused={!motion} mouseInteraction={motion} pulseOnClick={motion} holdToGather={motion} dpr={1.5} onError={()=>setFailed(true)}/>}
  </div>;
}
