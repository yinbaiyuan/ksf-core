import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {RadioGroup} from '@ksf/sdk/radio-group';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function RadioGroupButtonsExample(){const [value,setValue]=useState('read');return <div className='ksf-demo-stack'><RadioGroup label='操作类型' appearance='button' options={[{value:'read',label:'阅读'},{value:'edit',label:'编辑'},{value:'share',label:'分享'},{value:'locked',label:'审核',disabled:true}]} value={value} onValueChange={setValue}/><output>{value}</output></div>;}
