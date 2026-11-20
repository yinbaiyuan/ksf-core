import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Steps} from '@ksf/sdk/steps';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function StepsIconsExample(){return <Steps current={1} items={[{id:'a',title:'资料',icon:<FolderGlyph/>},{id:'b',title:'检查',icon:<SearchGlyph/>},{id:'c',title:'完成',icon:<CheckGlyph/>}]}/>;}
