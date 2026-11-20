import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {SearchField} from '@ksf/sdk/search-field';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SearchFieldStatusesExample(){return <div className='ksf-demo-stack'><SearchField label='正常状态'/><SearchField label='提醒状态' status='warning' description='请核对后继续。'/><SearchField label='错误状态' status='error' error='此项需要修正。'/><SearchField label='已确认' status='success'/></div>;}
