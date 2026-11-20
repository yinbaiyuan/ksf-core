import {useState,type SVGProps} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {ButtonGroup} from '@ksf/sdk/button-group';
export function ButtonGroupStatesExample(){const [action,setAction]=useState('');return <div className='ksf-demo-row'><ButtonGroup label='垂直操作' orientation='vertical' attached>{['新建','保存','归档'].map(label=><Button key={label} onClick={()=>setAction(label)}>{label}</Button>)}</ButtonGroup><ButtonGroup label='混合状态' attached><Button disabled>上一步</Button><Button variant='solid' tone='primary' onClick={()=>setAction('下一步')}>下一步</Button></ButtonGroup><output>{action}</output></div>;}
