import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Combobox} from '@ksf/sdk/combobox';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ComboboxSuggestionsExample(){const [value,setValue]=useState('');return <div className='ksf-demo-stack'><Combobox label='资料关键词' value={value} onValueChange={setValue} options={[{value:'project',label:'项目资料'},{value:'plan',label:'规划说明'},{value:'review',label:'复核记录'}]} clearable/><output>当前值：{value}</output></div>;}
