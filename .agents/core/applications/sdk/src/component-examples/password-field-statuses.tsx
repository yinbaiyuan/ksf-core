import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {PasswordField} from '@ksf/sdk/password-field';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function PasswordFieldStatusesExample(){return <div className='ksf-demo-stack'><PasswordField label='正常状态'/><PasswordField label='提醒状态' status='warning' description='请核对后继续。'/><PasswordField label='错误状态' status='error' error='此项需要修正。'/><PasswordField label='已确认' status='success'/></div>;}
