import {useRef, useState, type SVGProps} from 'react';
import {View} from '@ksf/sdk/view';
import {IconButton} from '@ksf/sdk/icon-button';
const Plus = (props: SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}><path d="M12 4v16M4 12h16"/></svg>;
const Star = (props: SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}><path d="M12 3l3 6 6 1-4.5 4.5 1 6.5-5.5-3-5.5 3 1-6.5L3 10l6-1z"/></svg>;
export function IconButtonBasicExample() {
  const add = useRef<HTMLButtonElement>(null), [count, setCount] = useState(0), [starred, setStarred] = useState(false);
  return <View style={{gap: 18}}>
    <View direction="row" style={{gap: 12, alignItems: 'center', flexWrap: 'wrap'}}>
      <IconButton icon={Plus} label="增加示例计数" variant="solid" tone="primary" ref={add} onClick={() => setCount(value => value + 1)}/>
      <IconButton icon={Star} label={starred ? '取消收藏示例' : '收藏示例'} aria-pressed={starred} variant={starred ? 'solid' : 'outlined'} tone={starred ? 'primary' : 'neutral'} onClick={() => setStarred(value => !value)}/>
      <IconButton icon={Plus} label="暂不可用的图标按钮" disabled/>
    </View>
    <output role="status">已增加 {count} 次 · {starred ? '已收藏' : '未收藏'}</output>
  </View>;
}
