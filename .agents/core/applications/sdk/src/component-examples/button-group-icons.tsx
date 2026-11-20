import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ButtonGroup} from '@ksf/sdk/button-group';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ButtonGroupIconsExample(){const [value,setValue]=useState('');return <div className='ksf-demo-stack'><ButtonGroup label='资料操作' attached><Button icon={<FolderGlyph/>} onClick={()=>setValue('目录')}>目录</Button><Button icon={<SearchGlyph/>} onClick={()=>setValue('搜索')}>搜索</Button><Button icon={<CheckGlyph/>} tone='primary' variant='solid' onClick={()=>setValue('确认')}>确认</Button></ButtonGroup><output>{value}</output></div>;}
