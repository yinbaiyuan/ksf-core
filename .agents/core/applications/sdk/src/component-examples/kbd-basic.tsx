import {useRef} from 'react';
import {View} from '@ksf/sdk/view';
import {Kbd} from '@ksf/sdk/kbd';

export function KbdBasicExample() {
  const key = useRef<HTMLElement>(null);
  return <View style={{gap: 22}}>
    <View direction="row" style={{gap: 12, alignItems: 'center', flexWrap: 'wrap'}}>
      <Kbd ref={key}>Enter</Kbd><Kbd>Esc</Kbd><Kbd aria-label="向上箭头">↑</Kbd><Kbd aria-label="向下箭头">↓</Kbd>
    </View>
    <View direction="row" style={{gap: 12, alignItems: 'center', flexWrap: 'wrap'}}>
      <Kbd aria-label="Command K">⌘ K</Kbd><span>macOS 组合键提示</span>
    </View>
    <View direction="row" style={{gap: 12, alignItems: 'center', flexWrap: 'wrap'}}>
      <Kbd aria-label="Control Shift P">Ctrl Shift P</Kbd><span>其他平台的按键文字由应用提供</span>
    </View>
    <span>这里仅展示按键，不监听或注册快捷键。</span>
  </View>;
}
