import {useId, useState} from 'react';
import {View} from '@ksf/sdk/view';
import {Link} from '@ksf/sdk/link';
export function LinkBasicExample() {
  const id = useId(), [count, setCount] = useState(0);
  return <View style={{gap: 18}}>
    <p><Link href={`#${id}-target`} onClick={() => setCount(value => value + 1)}>跳到示例内容</Link></p>
    <p>文字中也可以使用 <Link href={`#${id}-target`} onClick={() => setCount(value => value + 1)}>行内链接</Link>，保留原生锚点与键盘导航。</p>
    <div id={`${id}-target`} tabIndex={-1} style={{padding: 18, border: '1px solid var(--ksf-color-border)', borderRadius: 4}}>这是当前窗口内的锚点目标。</div>
    <output role="status">已导航 {count} 次</output>
  </View>;
}
