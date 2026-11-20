import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Switch} from '@ksf/sdk/switch';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SwitchTextExample(){return <div className='ksf-demo-row'><Switch label='启用通知' checkedContent='开' uncheckedContent='关'/><Switch label='显示状态' defaultChecked checkedContent='ON' uncheckedContent='OFF'/></div>;}
