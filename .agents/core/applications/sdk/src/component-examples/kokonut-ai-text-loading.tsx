import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {AITextLoading} from '@ksf/sdk/ai-text-loading';
export default function Example(){const [paused,setPaused]=useState(false);return <div style={{display:'grid',gap:24,width:'100%'}}><AITextLoading label="正在处理" messages={['正在整理线索','正在核对示例','即将呈现结果']} paused={paused} showElapsed/><Button onClick={()=>setPaused(!paused)}>{paused?'继续动效':'暂停动效'}</Button></div>}
