import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ToggleGroup} from '@ksf/sdk/toggle-group';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ToggleGroupDisabledExample(){return <div className='ksf-demo-stack'><ToggleGroup label='部分停用' options={[{value:'day',label:'日'},{value:'week',label:'周',disabled:true},{value:'month',label:'月'}]}/><ToggleGroup label='全部停用' disabled options={[{value:'a',label:'资料'},{value:'b',label:'任务'}]}/></div>;}
