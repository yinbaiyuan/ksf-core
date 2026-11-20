import {useRef, useState, type SVGProps} from 'react';
import {View} from '@ksf/sdk/view';
import {Icon} from '@ksf/sdk/icon';
import {Button} from '@ksf/sdk/button';
import {themeVars} from '@ksf/sdk/theme';

// Local SVG examples; Icon also accepts SVG components from a library chosen by the app.
type GlyphProps = SVGProps<SVGSVGElement>;
const Search = (props: GlyphProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} {...props}><circle cx={10} cy={10} r={6}/><path d="M15 15l6 6"/></svg>;
const Folder = (props: GlyphProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} {...props}><path d="M3 7V4h7l3 3h8v13H3z"/></svg>;
const CircleCheck = (props: GlyphProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} {...props}><circle cx={12} cy={12} r={9}/><path d="M7 12l3 3 7-7"/></svg>;
const TriangleAlert = (props: GlyphProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} {...props}><path d="M12 3l10 18H2zM12 8v6m0 3v1"/></svg>;

export function IconBasicExample() {
  const namedIcon = useRef<HTMLSpanElement>(null);
  const [feedback, setFeedback] = useState('点击下方按钮查看本地反馈');
  return <View style={{gap: 24}}>
    <View direction="row" style={{gap: 20, alignItems: 'center', flexWrap: 'wrap'}}>
      <Icon icon={Folder} size={16}/><Icon icon={Folder} size={24}/><Icon icon={Folder} size={32}/>
      <span>16 / 24 / 32px · 继承当前文字颜色</span>
    </View>
    <View direction="row" style={{gap: 16, alignItems: 'center', flexWrap: 'wrap'}}>
      <Icon icon={CircleCheck} label="已完成" ref={namedIcon} size={24} style={{color: themeVars.success}}/>
      <Icon icon={TriangleAlert} label="需要注意" size={24} style={{color: themeVars.warning}}/>
      <span>独立图标提供名称；相邻文字已说明含义时可作为装饰。</span>
    </View>
    <View direction="row" style={{gap: 12, alignItems: 'center', flexWrap: 'wrap'}}>
      <Button variant="solid" tone="primary" onClick={() => setFeedback('已点击搜索示例')}><Icon icon={Search}/>搜索</Button>
      <Button aria-label="打开文件夹" onClick={() => setFeedback('已点击文件夹示例')}><Icon icon={Folder}/></Button>
      <span>图标不注册点击或快捷键，操作由外层 Button 承载。</span>
    </View>
    <output role="status">{feedback}</output>
  </View>;
}
