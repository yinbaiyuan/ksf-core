import {useState,useRef} from 'react';
import {RadioGroup} from '@ksf/sdk/radio-group';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function RadioGroupStatesExample(){return <form className='ksf-demo-stack'><RadioGroup label='竖向排列' direction='column' name='work' options={[{value:'design',label:'设计'},{value:'develop',label:'开发'},{value:'review',label:'评审'},{value:'later',label:'暂未开放',disabled:true}]} defaultValue='review'/><RadioGroup label='全部禁用' options={[{value:'design',label:'设计'},{value:'develop',label:'开发'},{value:'review',label:'评审'},{value:'later',label:'暂未开放',disabled:true}]} defaultValue='design' disabled/><Button type='reset'>还原</Button></form>;}
