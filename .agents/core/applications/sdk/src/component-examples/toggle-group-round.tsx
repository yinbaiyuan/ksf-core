import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ToggleGroup} from '@ksf/sdk/toggle-group';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ToggleGroupRoundExample(){return <ToggleGroup label='圆角选择' shape='round' options={[{value:'day',label:'今日'},{value:'week',label:'本周'},{value:'month',label:'本月'}]}/>;}
