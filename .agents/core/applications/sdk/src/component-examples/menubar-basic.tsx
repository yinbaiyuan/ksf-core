import {useState} from 'react';
import {View} from '@ksf/sdk/view';
import {Menubar, type MenubarMenu} from '@ksf/sdk/menubar';
export function MenubarBasicExample() {
  const [feedback, setFeedback] = useState('请选择菜单命令');
  const menus: MenubarMenu[] = [
    {id: 'file', label: '文件', items: [
      {id: 'new', label: '新建示例', onAction: () => setFeedback('已新建示例')},
      {id: 'export', label: '导出示例', items: [{id: 'text', label: '纯文本', onAction: () => setFeedback('已选择纯文本')} ]},
    ]},
    {id: 'edit', label: '编辑', items: [
      {id: 'copy', label: '复制示例', onAction: () => setFeedback('已复制示例')},
      {id: 'cut', label: '剪切示例', disabled: true, onAction: () => setFeedback('不应执行')},
    ]},
    {id: 'unavailable', label: '不可用菜单', disabled: true, items: []},
    {id: 'help', label: '帮助', items: [{id: 'about', label: '关于示例', onAction: () => setFeedback('这是应用内部菜单栏示例')}]},
  ];
  return <View style={{gap: 18}}><Menubar label="示例应用菜单栏" menus={menus}/><output role="status">{feedback}</output></View>;
}
