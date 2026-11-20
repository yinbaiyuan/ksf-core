import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ToggleGroup} from '@ksf/sdk/toggle-group';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ToggleGroupIconsExample(){const [value,setValue]=useState('folder');return <div className='ksf-demo-stack'><ToggleGroup label='资料显示' value={value} onValueChange={setValue} options={[{value:'folder',label:'资料',icon:<FolderGlyph/>},{value:'search',label:'搜索',icon:<SearchGlyph/>},{value:'done',label:'完成',icon:<CheckGlyph/>}]}/><output>{value}</output></div>;}
