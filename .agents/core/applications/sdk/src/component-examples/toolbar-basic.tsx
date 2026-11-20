import {useState} from 'react';
import {View} from '@ksf/sdk/view';
import {Toolbar, type ToolbarAction} from '@ksf/sdk/toolbar';
export function ToolbarBasicExample() {
  const [width, setWidth] = useState(360), [feedback, setFeedback] = useState('尚未执行操作');
  const items: ToolbarAction[] = [
    {id: 'new', label: '新建', group: 'file', priority: 100, onAction: () => setFeedback('已新建示例')},
    {id: 'copy', label: '复制', group: 'file', priority: 80, onAction: () => setFeedback('已复制示例')},
    {id: 'rename', label: '重命名', group: 'edit', priority: 30, onAction: () => setFeedback('已重命名示例')},
    {id: 'undo', label: '撤销', group: 'edit', priority: 20, disabled: true, onAction: () => setFeedback('不应执行')},
    {id: 'details', label: '查看详情', group: 'view', priority: 40, onAction: () => setFeedback('已查看示例详情')},
    {id: 'reset', label: '重置示例', group: 'view', priority: 10, onAction: () => setFeedback('已重置本地示例')},
  ];
  return <View style={{gap: 18}}>
    <label style={{display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap'}}>工具栏预览宽度 <input type="range" aria-label="工具栏预览宽度" min={180} max={680} value={width} onChange={event => setWidth(Number(event.target.value))}/><span>{width}px</span></label>
    <div style={{width: `min(100%, ${width}px)`}}><Toolbar label="示例内容工具栏" items={items}/></div>
    <output role="status">{feedback}</output>
  </View>;
}
