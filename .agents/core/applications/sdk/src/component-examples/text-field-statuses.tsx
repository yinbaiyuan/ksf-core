import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TextField} from '@ksf/sdk/text-field';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function TextFieldStatusesExample(){return <div className='ksf-demo-stack'><TextField label='正常状态'/><TextField label='提醒状态' status='warning' description='请核对后继续。'/><TextField label='错误状态' status='error' error='此项需要修正。'/><TextField label='已确认' status='success'/></div>;}
