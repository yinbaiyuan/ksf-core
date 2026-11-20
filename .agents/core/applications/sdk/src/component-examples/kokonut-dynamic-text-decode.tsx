import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {AnimatedText} from '@ksf/sdk/animated-text';
export default function Example(){const [text,setText]=useState('DESIGN READY');return <div style={{display:'grid',gap:24}}><AnimatedText style={{fontSize:28}} text={text} effect="morph" decode/><Button onClick={()=>setText(text==='DESIGN READY'?'MOTION READY':'DESIGN READY')}>切换解码文字</Button></div>;}
