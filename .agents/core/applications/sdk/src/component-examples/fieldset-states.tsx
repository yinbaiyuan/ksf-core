import {useState} from 'react';
import {Fieldset} from '@ksf/sdk/fieldset';
import {TextField} from '@ksf/sdk/text-field';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FieldsetStatesExample(){const [disabled,setDisabled]=useState(true);return <div className='ksf-demo-stack'><Button onClick={()=>setDisabled(v=>!v)}>切换整组禁用</Button><Fieldset legend='高级设置' disabled={disabled}><TextField label='归档目录' defaultValue='项目资料'/><Button>预览归档</Button></Fieldset></div>;}
