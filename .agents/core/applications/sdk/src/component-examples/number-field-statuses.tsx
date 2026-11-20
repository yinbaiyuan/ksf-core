import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {NumberField} from '@ksf/sdk/number-field';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function NumberFieldStatusesExample(){return <div className='ksf-demo-stack'><NumberField label='正常状态'/><NumberField label='提醒状态' status='warning' description='请核对后继续。'/><NumberField label='错误状态' status='error' error='此项需要修正。'/><NumberField label='已确认' status='success'/></div>;}
