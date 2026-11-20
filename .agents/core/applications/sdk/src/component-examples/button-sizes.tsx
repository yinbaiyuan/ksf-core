import {useState} from 'react';
import {View} from '@ksf/sdk/view';
import {Button, type ButtonSize} from '@ksf/sdk/button';
export function ButtonSizesExample() {
  const [feedback,setFeedback]=useState('默认中尺寸，按场景选择');
  return <View style={{gap:16,background:'transparent'}}><div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>{(['small','medium','large'] as ButtonSize[]).map((size,index)=><Button key={size} size={size} tone="primary" variant="solid" onClick={()=>setFeedback(`已选择${['小','中','大'][index]}尺寸`)}>{['小尺寸','默认尺寸','大尺寸'][index]}</Button>)}</div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Button shape="round" onClick={()=>setFeedback('圆角按钮用于独立操作')}>圆角操作</Button><Button disabled>当前不可用</Button></div><output role="status">{feedback}</output></View>;
}
