import {useId} from 'react';
import {View} from '@ksf/sdk/view';

/** Additional visual explanation; the copyable example is rendered by the detail page. */
export function ViewThemePreview() {
  const headingId=useId();
  return <section aria-labelledby={headingId}>
    <div className="detail-section-heading"><h2 id={headingId}>局部主题</h2><span className="detail-example-caption">真实 View · 同一窗口内独立覆盖</span></div>
    <div className="component-library-theme-pair">
      {(['light', 'dark'] as const).map(theme => <View key={theme} theme={theme} className="component-library-theme-sample" style={{padding: 20, gap: 8}}>
        <strong>{theme === 'light' ? '浅色' : '深色'} <code>theme="{theme}"</code></strong>
        <View style={{background: 'transparent'}}><p>嵌套内容继承这里的主题。</p></View>
      </View>)}
    </div>
    <p className="detail-example-effects">局部覆盖只影响自己的容器与后代；顶部切换继续控制其余预览。</p>
  </section>;
}
