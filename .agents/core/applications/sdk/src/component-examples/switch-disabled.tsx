import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Switch} from '@ksf/sdk/switch';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SwitchDisabledExample(){return <div className='ksf-demo-row'><Switch label='禁用关闭' disabled/><Switch label='禁用开启' defaultChecked disabled/></div>;}
