import {useState,useRef} from 'react';
import {NumberField} from '@ksf/sdk/number-field';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function NumberFieldStatesExample(){return <div className='ksf-demo-stack'><NumberField label='步进 0.25' defaultValue={1.5} min={0} max={3} step={0.25}/><NumberField label='原生输入' controls={false} defaultValue={10}/><NumberField label='只读' defaultValue={20} readOnly/><NumberField label='禁用' disabled/></div>;}
