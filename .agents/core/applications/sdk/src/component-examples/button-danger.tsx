import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {View} from '@ksf/sdk/view';
export function ButtonDangerExample() {
  const [removed,setRemoved]=useState(false);
  return <View style={{gap:16,background:'transparent'}}><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Button tone="danger" onClick={()=>setRemoved(true)} disabled={removed}>移除示例</Button><Button tone="danger" variant="solid" onClick={()=>setRemoved(true)} disabled={removed}>确认移除</Button><Button tone="danger" variant="text" onClick={()=>setRemoved(true)} disabled={removed}>危险文字操作</Button></div><output role="status">{removed?'示例已移除，可恢复以继续体验':'仅修改示例状态，不操作真实资料'}</output><Button size="small" disabled={!removed} onClick={()=>setRemoved(false)}>恢复示例</Button></View>;
}
