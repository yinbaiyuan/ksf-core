import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Select} from '@ksf/sdk/select';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SelectStatusesExample(){return <div className='ksf-demo-stack'><Select label='正常状态' options={[{value:'research',label:'研究资料'},{value:'delivery',label:'交付资料'},{value:'notes',label:'讨论纪要'}]}/><Select label='提醒状态' status='warning' options={[{value:'research',label:'研究资料'},{value:'delivery',label:'交付资料'},{value:'notes',label:'讨论纪要'}]} description='请核对后继续。'/><Select label='错误状态' status='error' options={[{value:'research',label:'研究资料'},{value:'delivery',label:'交付资料'},{value:'notes',label:'讨论纪要'}]} error='此项需要修正。'/><Select label='已确认' status='success' options={[{value:'research',label:'研究资料'},{value:'delivery',label:'交付资料'},{value:'notes',label:'讨论纪要'}]}/></div>;}
