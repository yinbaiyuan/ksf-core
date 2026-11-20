import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {RadioGroup} from '@ksf/sdk/radio-group';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function RadioGroupBlockExample(){return <RadioGroup label='展示模式' appearance='button' fullWidth options={[{value:'list',label:'列表'},{value:'grid',label:'网格'},{value:'detail',label:'详情'}]}/>;}
