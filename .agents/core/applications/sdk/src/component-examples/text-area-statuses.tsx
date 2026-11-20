import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TextArea} from '@ksf/sdk/text-area';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TextAreaStatusesExample(){return <div className='ksf-demo-stack'><TextArea label='正常状态'/><TextArea label='提醒状态' status='warning' description='请核对后继续。'/><TextArea label='错误状态' status='error' error='此项需要修正。'/><TextArea label='已确认' status='success'/></div>;}
