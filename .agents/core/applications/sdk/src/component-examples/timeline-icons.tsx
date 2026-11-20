import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Timeline} from '@ksf/sdk/timeline';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TimelineIconsExample(){return <Timeline items={[{id:'a',title:'检查通过',icon:<CheckGlyph/>,tone:'success'},{id:'b',title:'资料待补充',icon:<FolderGlyph/>,tone:'warning'},{id:'c',title:'尚未开始',tone:'neutral'}]}/>;}
