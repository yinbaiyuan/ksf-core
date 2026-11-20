import {useState} from 'react';
import {MotionButton} from '@ksf/sdk/motion-button';
import {Checkbox} from '@ksf/sdk/checkbox';
import {useLocalDemoTasks} from '@ksf/sdk/component-examples/local-demo-tasks';
export default function Example(){const [fail,setFail]=useState(false),[result,setResult]=useState('');const {wait}=useLocalDemoTasks();return <div style={{display:'grid',gap:24,justifyItems:'start'}}><Checkbox checked={fail} onCheckedChange={setFail}>模拟失败</Checkbox><MotionButton effect="particle" onClick={async()=>{await wait(900);if(fail)throw new Error('模拟保存失败');}} onSuccess={()=>setResult('本地模拟成功')} onError={()=>setResult('本地模拟失败，可再次重试')}>保存示例</MotionButton><output aria-live="polite">{result}</output></div>}
