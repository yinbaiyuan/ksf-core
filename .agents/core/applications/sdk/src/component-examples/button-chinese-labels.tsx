import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ButtonChineseLabelsExample(){const [value,setValue]=useState('等待操作');return <div className='ksf-demo-stack'><div className='ksf-demo-row'><Button onClick={()=>setValue('搜索')}>搜索</Button><Button onClick={()=>setValue('保 存')}>保 存</Button><Button onClick={()=>setValue('提交资料')}>提交资料</Button><Button autoSpace={false} onClick={()=>setValue('不增加字间距')}>搜索</Button></div><output role='status'>{value}</output></div>;}
