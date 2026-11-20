import {useState} from 'react';
import {ErrorSummary} from '@ksf/sdk/error-summary';
import {TextField} from '@ksf/sdk/text-field';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ErrorSummaryStatesExample(){const [target,setTarget]=useState('尚未定位');return <div className='ksf-demo-stack'><ErrorSummary title='应用自定义定位' errors={[{id:'remote-section',message:'检查交付范围'}]} onNavigate={id=>setTarget(`定位到：${id}`)}/><output>{target}</output></div>;}
