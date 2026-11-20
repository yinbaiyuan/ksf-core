import {useState,type SVGProps} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {IconButton} from '@ksf/sdk/icon-button';
export function IconButtonStatesExample(){const [count,setCount]=useState(0),Glyph=(props:SVGProps<SVGSVGElement>)=><svg viewBox='0 0 24 24' stroke='currentColor' strokeWidth='2' {...props}><path d='M12 4v16M4 12h16'/></svg>;return <div className='ksf-demo-stack'><div className='ksf-demo-row'>{(['small','medium','large'] as const).map(size=><IconButton key={size} size={size} icon={Glyph} label={`添加${size}`} onClick={()=>setCount(v=>v+1)}/>)}<IconButton icon={Glyph} label='正在处理' loading/><IconButton icon={Glyph} label='删除项目' tone='danger' variant='soft' shape='circle' onClick={()=>setCount(v=>Math.max(0,v-1))}/></div><output>计数：{count}</output></div>;}
