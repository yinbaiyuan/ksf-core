import {useId} from 'react';
import {Table,type TableColumn} from '@ksf/sdk/table';
import {Heading,Text,InlineCode} from '@ksf/sdk/typography';
import {View} from '@ksf/sdk/view';
import {themeColors, themeVars, themeColorNames, themeColorDefinitions, themeColorProperties,
  type ThemeColorName} from '@ksf/sdk/theme';

export const themeReactUsage = `import { View } from '@ksf/sdk/view';
import { themeVars } from '@ksf/sdk/theme';

export function ApplicationPanel() {
  return <View style={{ padding: 24 }}>
    <div style={{ background: themeVars.surface,
                  color: themeVars.foreground }}>应用内容</div>
  </View>;
}

/* 应用自己的 CSS 也可以直接使用变量 */
/* .my-panel {
  background: var(--ksf-color-surface);
  color: var(--ksf-color-foreground);
} */`;

export function ThemePreview() {
  const headingId=useId();
  return <section aria-labelledby={headingId}>
    <div className="detail-section-heading"><h2 id={headingId}>同一组用途，两套配色</h2><span className="detail-example-caption">SDK 默认配色 · 浅深对照</span></div>
    <div className="theme-preview-pair">{(['light', 'dark'] as const).map(mode => <View key={mode} theme={mode} className="theme-preview" style={{padding: 24, gap: 18}}>
      <div><span className="component-library-eyebrow">{mode.toUpperCase()}</span><h3>{mode === 'light' ? '浅色主题' : '深色主题'}</h3><p>正文与边界各有自己的颜色职责。</p></div>
      <div className="theme-preview-surface"><strong>内容分区</strong><p>辅助说明也保持清晰可读。</p></div>
      <div className="theme-feedback-grid">{(['info', 'success', 'warning', 'danger'] as const).map(name => <span key={name}
        style={{color: themeVars[name], background: themeVars[(name + 'Surface') as ThemeColorName]}}>{({info: '普通提示', success: '操作成功', warning: '请留意', danger: '危险信息'})[name]}</span>)}</div>
      <button type="button" className="theme-demo-button">主要操作 · 原生按钮</button>
    </View>)}</div>
    <p className="detail-example-effects">预览和 API 页的色值都来自 SDK 默认主题。应用可以在自己的容器内覆盖颜色变量。</p>
  </section>;
}

export function ThemeColorTable(){
 const columns:TableColumn<{name:ThemeColorName}>[]=[{id:'role',header:'用途与变量',width:300,cell:({name})=><div><Text strong>{themeColorDefinitions[name].label}</Text><div><InlineCode>{themeColorProperties[name]}</InlineCode></div><Text size="caption" tone="muted">{themeColorDefinitions[name].usage}</Text></div>},...(['light','dark'] as const).map(mode=>({id:mode,header:mode==='light'?'浅色':'深色',width:150,cell:({name}:{name:ThemeColorName})=><span className="theme-color-value"><i aria-hidden="true" style={{background:themeColors[mode][name]}}/><InlineCode>{themeColors[mode][name]}</InlineCode></span>}))];
 return <section><Heading level={3}>颜色清单</Heading><Text as="p" tone="muted">{themeColorNames.length} 个语义名称 · SDK 同源。轻边界用于分组；交互边界用于识别控件。</Text><Table label="浅深主题颜色表格" rows={themeColorNames.map(name=>({name}))} columns={columns} getId={row=>row.name} size="small" pagination={false}/></section>;
}
