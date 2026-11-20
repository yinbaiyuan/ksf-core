import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Space} from '@ksf/sdk/space';
import {TextField} from '@ksf/sdk/text-field';
import {Select} from '@ksf/sdk/select';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SpaceCompactButtonsExample(){const [value,setValue]=useState('');return <div className='ksf-demo-stack'><Space compact><Button onClick={()=>setValue('上一页')}>上一页</Button><Button onClick={()=>setValue('当前页')}>当前页</Button><Button onClick={()=>setValue('下一页')}>下一页</Button></Space><output>{value}</output></div>;}
