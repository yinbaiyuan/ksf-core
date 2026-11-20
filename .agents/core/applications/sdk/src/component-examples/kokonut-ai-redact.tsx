import {useState} from 'react';
import {Redaction} from '@ksf/sdk/redaction';
export default function Example(){const [text,setText]=useState('请联系王小明：demo@example.com，电话13800138000。');return <Redaction title="发送前隐私处理" value={text} onValueChange={setText} names={['王小明']} onSubmit={({maskedText})=>`本地示例仅收到脱敏占位符：${maskedText}`}/>;}
