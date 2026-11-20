import {useState,useRef} from 'react';
import {ToggleGroup} from '@ksf/sdk/toggle-group';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ToggleGroupStatesExample(){return <form className='ksf-demo-stack'><ToggleGroup label='撑满宽度' fullWidth name='view' options={[{value:'design',label:'设计'},{value:'develop',label:'开发'},{value:'review',label:'评审'},{value:'later',label:'暂未开放',disabled:true}]} defaultValue='review'/><ToggleGroup label='禁用分段' options={[{value:'design',label:'设计'},{value:'develop',label:'开发'},{value:'review',label:'评审'},{value:'later',label:'暂未开放',disabled:true}]} disabled defaultValue='design'/><Button type='reset'>还原分段</Button></form>;}
