import { createPortal } from 'react-dom';
import { GlassSurface } from './glass-surface';
import { useMaterialStyle } from './material-provider';

// This uses the same sheet classes and glass component as real source/detail drawers.
// The photo and example content only make opacity, frost, radius and shadow easy to compare.
export function DrawerMaterialPreview({ inline = false }: { inline?: boolean }) {
  const style = useMaterialStyle();
  const preview = <section className={'drawer-material-stage' + (inline ? ' is-inline' : '')} style={style} aria-label="系统抽屉实时预览">
    <header><strong>系统抽屉 · 实时预览</strong><span>示例内容</span></header>
    <div className="drawer-material-scene"><div className="sheet sheet-right drawer-material-preview">
      <GlassSurface mode="frost" profile="drawer" />
      <div className="sheet-heading"><div><h3>系统抽屉</h3><p className="sheet-description">与桌面系统抽屉共用材质</p></div><span className="drawer-preview-badge">预览</span></div>
      <div className="sheet-body"><p className="drawer-preview-kicker">能力安排</p><h4>高级交互设计师</h4><p>组织体验设计、视觉设计与界面落地。</p><dl><div><dt>来源</dt><dd>用户能力</dd></div><div><dt>版本</dt><dd>0.1.0</dd></div><div><dt>状态</dt><dd>已采用</dd></div></dl><p className="drawer-preview-note">调整参数，观察背景透出、模糊程度、圆角和阴影。</p></div>
    </div></div>
    <p>预览不包含对话原文；参数应用于桌面系统抽屉，应用内详情保持实色。</p>
  </section>;
  return inline ? preview : createPortal(preview, document.body);
}
