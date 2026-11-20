import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Combobox} from '@ksf/sdk/combobox';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ComboboxDynamicOptionsExample(){const [value,setValue]=useState('');const options=value.includes('@')?['ksf.example','demo.example'].map(domain=>({value:value.split('@')[0]+'@'+domain,label:value.split('@')[0]+'@'+domain})):[];return <Combobox label='邮箱建议' value={value} onValueChange={setValue} options={options} placeholder='输入名称和@'/>;}
