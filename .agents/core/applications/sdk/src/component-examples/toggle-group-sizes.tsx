import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ToggleGroup} from '@ksf/sdk/toggle-group';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ToggleGroupSizesExample(){return <div className='ksf-demo-stack'>{(['small','medium','large'] as const).map(size=><ToggleGroup key={size} label={size+'分段'} size={size} options={[{value:'day',label:'日'},{value:'week',label:'周'},{value:'month',label:'月'}]}/>)}</div>;}
