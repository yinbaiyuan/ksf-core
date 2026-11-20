import {useRef, useState} from 'react';
import {View} from '@ksf/sdk/view';
import {ContextMenu, type MenuItem} from '@ksf/sdk/context-menu';
export function ContextMenuBasicExample() {
  const target = useRef<HTMLDivElement>(null), [feedback, setFeedback] = useState('尚未执行操作');
  const items: MenuItem[] = [
    {id: 'open', label: '查看示例', onAction: () => setFeedback('已查看示例')},
    {id: 'rename', label: '重命名示例', onAction: () => setFeedback('已重命名示例')},
    {id: 'copy', label: '复制为', items: [{id: 'title', label: '标题示例', onAction: () => setFeedback('已选择复制标题')}]},
    {id: 'separator', type: 'separator'},
    {id: 'remove', label: '移除示例', danger: true, onAction: () => setFeedback('已移除本地示例')},
  ];
  return <View style={{gap: 18}}>
    <ContextMenu label="示例文件操作" items={items} ref={target} style={{padding: 28, border: '1px dashed var(--ksf-color-border-strong)', borderRadius: 6}}>
      <strong>示例文件.txt</strong><p>在此处右键，或聚焦后按 Shift+F10。</p>
    </ContextMenu>
    <output role="status">{feedback}</output>
  </View>;
}
