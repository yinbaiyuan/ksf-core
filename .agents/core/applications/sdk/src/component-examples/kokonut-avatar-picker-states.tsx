import {AvatarPicker} from '@ksf/sdk/avatar-picker';
export default function Example(){return <div style={{display:'flex',gap:24,flexWrap:'wrap',alignItems:'start',width:'100%',minWidth:0}}><AvatarPicker label="锁定头像" value={{displayName:'Robin Vale',variant:3}} disabled/><AvatarPicker label="至少两个字符" defaultValue={{displayName:'R',variant:0}}/></div>;}
