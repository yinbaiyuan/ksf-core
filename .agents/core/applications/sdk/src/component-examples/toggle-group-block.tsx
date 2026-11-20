import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ToggleGroup} from '@ksf/sdk/toggle-group';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ToggleGroupBlockExample(){return <ToggleGroup label='视图选择' fullWidth options={[{value:'list',label:'列表'},{value:'grid',label:'网格'},{value:'detail',label:'详情'}]}/>;}
