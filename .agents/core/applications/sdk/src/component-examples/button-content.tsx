import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {View} from '@ksf/sdk/view';
export function ButtonContentExample() {
  const [feedback,setFeedback] = useState('图标与文字按统一间距排布');
  const arrow = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>;
  const plus = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 5v14M5 12h14"/></svg>;
  return <View style={{gap:16,background:'transparent'}}><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Button icon={plus} onClick={()=>setFeedback('已添加一项')}>添加一项</Button><Button icon={arrow} iconPosition="end" tone="primary" variant="solid" onClick={()=>setFeedback('已进入下一步')}>下一步</Button><Button icon={plus} shape="circle" aria-label="添加项目" onClick={()=>setFeedback('已添加项目')}/></div><Button fullWidth icon={arrow} iconPosition="end" onClick={()=>setFeedback('已打开全部资料')}>查看全部资料</Button><output role="status">{feedback}</output></View>;
}
