import {useState,useRef,useId} from 'react';
import {Steps} from '@ksf/sdk/steps';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function StepsStatesExample(){return <Steps orientation='vertical' size='small' current={1} status='error' items={[{id:'one',title:'已完成',description:'资料准备完成'},{id:'two',title:'需要重试',description:'由应用提供失败原因'},{id:'three',title:'待交付'}]}/>;}
