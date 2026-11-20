import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ButtonGroup} from '@ksf/sdk/button-group';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ButtonGroupAttachedExample(){const [value,setValue]=useState('');return <div className='ksf-demo-stack'><ButtonGroup attached label='版本操作'><Button onClick={()=>setValue('上一版')}>上一版</Button><Button onClick={()=>setValue('当前版')}>当前版</Button><Button onClick={()=>setValue('下一版')}>下一版</Button></ButtonGroup><output>{value}</output></div>;}
