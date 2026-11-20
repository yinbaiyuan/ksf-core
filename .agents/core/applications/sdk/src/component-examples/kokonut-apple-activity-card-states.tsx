import {ActivityRings} from '@ksf/sdk/activity-rings';

export default function Example(){return <ActivityRings label="目标边界" rings={[{id:'zero',label:'未开始',value:0,goal:100},{id:'unknown',label:'未设目标',value:20,goal:0}]}/>;}
