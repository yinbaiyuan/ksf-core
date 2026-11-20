import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Switch} from '@ksf/sdk/switch';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SwitchSizesExample(){return <div className='ksf-demo-row'><Switch label='常规开关' defaultChecked/><Switch label='小尺寸开关' size='small' defaultChecked/></div>;}
