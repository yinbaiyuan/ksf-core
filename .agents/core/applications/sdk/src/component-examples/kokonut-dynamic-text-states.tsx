import {AnimatedText} from '@ksf/sdk/animated-text';

export default function Example(){return <div style={{display:'grid',gap:24}}><AnimatedText style={{fontSize:18,lineHeight:1.5}} text="中文、é与👨‍👩‍👧都按字素显示" effect="morph" paused/><AnimatedText style={{fontSize:18,lineHeight:1.5}} text="" effect="thinking"/><AnimatedText style={{fontSize:18,lineHeight:1.5}} text="减少动态时呈现完整文字" effect="typewriter" paused/></div>;}
