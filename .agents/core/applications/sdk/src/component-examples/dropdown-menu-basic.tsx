import {useState} from 'react';
import {View} from '@ksf/sdk/view';
import {DropdownMenu, type MenuItem} from '@ksf/sdk/dropdown-menu';
export function DropdownMenuBasicExample() {
  const [feedback, setFeedback] = useState('请选择一项操作'), [summary, setSummary] = useState(true);
  const items: MenuItem[] = [
    {id: 'new', label: '新建副本示例', shortcut: '⌘ N', onAction: () => setFeedback('已新建示例副本')},
    {id: 'unavailable', label: '暂不可用', disabled: true, onAction: () => setFeedback('不应执行')},
    {id: 'separator', type: 'separator'},
    {id: 'summary', label: '显示摘要', checked: summary, onAction: () => {setSummary(value => !value); setFeedback('已切换摘要显示');}},
    {id: 'export', label: '导出为', items: [
      {id: 'text', label: '纯文本示例', onAction: () => setFeedback('已选择纯文本')},
      {id: 'more', label: '更多格式', items: [{id: 'json', label: 'JSON示例', onAction: () => setFeedback('已选择JSON格式')}]},
    ]},
    {id: 'remove', label: '移除示例', danger: true, onAction: () => setFeedback('已移除本地示例')},
    {id: 'failure', label: '失败反馈示例', onAction: async () => {throw Error('本地演示：操作未完成');}},
  ];
  return <View style={{gap: 18}}><DropdownMenu label="文档操作" items={items}/><output role="status">{feedback} · 摘要{summary ? '显示' : '隐藏'}</output></View>;
}
