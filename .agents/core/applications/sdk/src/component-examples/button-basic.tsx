import {useState} from 'react';
import {View} from '@ksf/sdk/view';
import {Button, type ButtonVariant} from '@ksf/sdk/button';
export function ButtonBasicExample() {
  const [feedback, setFeedback] = useState('选择一种操作层级');
  const variants: {variant: ButtonVariant; label: string}[] = [{variant:'solid',label:'主要操作'},{variant:'outlined',label:'标准操作'},{variant:'soft',label:'轻填充'},{variant:'text',label:'文字操作'},{variant:'dashed',label:'添加内容'}];
  return <View style={{gap:16,background:'transparent'}}><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{variants.map(({variant,label}) => <Button key={variant} variant={variant} tone={variant === 'solid' ? 'primary' : 'neutral'} onClick={() => setFeedback(`已执行：${label}`)}>{label}</Button>)}</div><output role="status" style={{fontSize:13,color:'var(--ksf-color-muted-foreground)'}}>{feedback}</output></View>;
}
