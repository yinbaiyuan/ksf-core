import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ToggleGroup} from '@ksf/sdk/toggle-group';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ToggleGroupVerticalExample(){return <ToggleGroup label='垂直分段' orientation='vertical' options={[{value:'overview',label:'概览'},{value:'details',label:'详情'},{value:'history',label:'历史'}]}/>;}
