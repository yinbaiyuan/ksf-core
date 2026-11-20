import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ButtonGroup} from '@ksf/sdk/button-group';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ButtonGroupVerticalExample(){const [value,setValue]=useState('');return <div className='ksf-demo-row'><ButtonGroup orientation='vertical' attached label='记录操作'>{['新建','复制','归档'].map(v=><Button key={v} onClick={()=>setValue(v)}>{v}</Button>)}</ButtonGroup><output>{value}</output></div>;}
