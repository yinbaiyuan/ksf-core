import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {ButtonGroup} from '@ksf/sdk/button-group';
import {DropdownMenu} from '@ksf/sdk/dropdown-menu';
import {View} from '@ksf/sdk/view';
export function ButtonCompositionExample() {
  const [feedback,setFeedback]=useState('文档操作区');
  return <View style={{gap:16,background:'transparent'}}><div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}><ButtonGroup label="文档主要操作"><Button variant="solid" tone="primary" onClick={()=>setFeedback('已保存本地示例')}>保存</Button><Button onClick={()=>setFeedback('已取消编辑')}>取消</Button></ButtonGroup><DropdownMenu label="更多操作" items={[{id:'copy',label:'复制副本',onAction:()=>setFeedback('已复制示例副本')},{id:'export',label:'导出资料',onAction:()=>setFeedback('已执行示例导出')}]}/></div><output role="status">{feedback}</output></View>;
}
