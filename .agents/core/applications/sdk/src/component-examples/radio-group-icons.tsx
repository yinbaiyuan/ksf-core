import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {RadioGroup} from '@ksf/sdk/radio-group';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function RadioGroupIconsExample(){return <RadioGroup label='图标单选项' appearance='button' options={[{value:'folder',label:'资料',icon:<FolderGlyph/>},{value:'search',label:'搜索',icon:<SearchGlyph/>}]}/>;}
