import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Combobox} from '@ksf/sdk/combobox';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ComboboxStatusesExample(){return <div className='ksf-demo-stack'><Combobox label='正常状态' options={[{value:'research',label:'研究资料'},{value:'delivery',label:'交付资料'},{value:'notes',label:'讨论纪要'}]}/><Combobox label='提醒状态' status='warning' options={[{value:'research',label:'研究资料'},{value:'delivery',label:'交付资料'},{value:'notes',label:'讨论纪要'}]} description='请核对后继续。'/><Combobox label='错误状态' status='error' options={[{value:'research',label:'研究资料'},{value:'delivery',label:'交付资料'},{value:'notes',label:'讨论纪要'}]} error='此项需要修正。'/><Combobox label='已确认' status='success' options={[{value:'research',label:'研究资料'},{value:'delivery',label:'交付资料'},{value:'notes',label:'讨论纪要'}]}/></div>;}
