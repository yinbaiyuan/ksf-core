import {Dialog} from '@ksf/sdk/dialog';
import {Form} from '@ksf/sdk/form';
import {SettingsField} from './settings-fields';
import {TextField} from '@ksf/sdk/text-field';
import {Button} from '@ksf/sdk/button';
import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { currentGroup, groupIcons, groupNameError, moveGroup, removeGroup, type DesktopPreferences, type GroupIcon } from '../desktop-model';
import { randomId } from '../random-id';
import { groupIconComponents, groupIconNames } from './sidebar';
import { SettingsGroup, SettingsActions, useSettingsDetail, useSettingsDraft, useSettingsNavigation } from './settings-controls';
type Editor = {
    id?: string;
    name: string;
    icon: GroupIcon;
};
export function GroupManager({ value, change, select, startNew, editing, edit, library }: {
    value: DesktopPreferences;
    change: (value: DesktopPreferences) => void;
    select: (id: string) => void;
    startNew: boolean;
    editing: boolean;
    edit: () => void;
    library: () => void;
}) {
    const initial: Editor | null = startNew && !editing ? { name: '', icon: 'grid' } : null;
    const [form, setForm] = useState<Editor | null>(initial), [baseline, setBaseline] = useState(JSON.stringify(initial)), [error, setError] = useState(''), [deleting, setDeleting] = useState<string | null>(null), navigate = useSettingsNavigation();
    const active = currentGroup(value), apps = active.layout.filter(item => item.kind === 'app').length;
    useSettingsDraft(form !== null && JSON.stringify(form) !== baseline, false, () => setForm(JSON.parse(baseline)));
    useSettingsDetail(form ? 'group:' + (form.id ?? 'new') : null, form?.id ? '编辑桌面分组' : '新增桌面分组', () => { setForm(null); setError(''); });
    function save(event: FormEvent) { event.preventDefault(); if (!form || editing)
        return; const problem = groupNameError(form.name, value.groups, form.id); if (problem) {
        setError(problem);
        return;
    } const id = form.id ?? 'group-' + randomId(), groups = form.id ? value.groups.map(group => group.id === id ? { ...group, name: form.name.trim(), icon: form.icon } : group) : [...value.groups, { id, name: form.name.trim(), icon: form.icon, layout: [] }]; change({ ...value, groups, activeGroupId: form.id ? value.activeGroupId : id }); setForm(null); setError(''); }
    function openForm(next: Editor) { navigate(() => { setDeleting(null); setError(''); setBaseline(JSON.stringify(next)); setForm(next); }); }
    if (form)
        return <Form onSubmit={save} layout="vertical"><SettingsGroup title="分组名称与图标"><div className="settings-form-fields"><SettingsField className="settings-field is-wide" label={<>分组名称</>}><TextField id="desktop-group-name" autoFocus value={form.name} placeholder="输入分组名称" aria-invalid={!!error} aria-describedby={error ? 'group-name-error' : undefined} onChange={event => { setForm({ ...form, name: event.target.value }); setError(''); }}/></SettingsField><fieldset className="settings-icon-field"><legend>分组图标</legend><div className="group-icon-picker">{groupIcons.map(icon => { const Icon = groupIconComponents[icon]; return <Button key={icon} type="button" aria-label={groupIconNames[icon] + '图标'} aria-pressed={form.icon === icon} onClick={() => setForm({ ...form, icon })}><Icon size={20}/></Button>; })}</div></fieldset>{error && <p id="group-name-error" className="settings-feedback is-error" role="alert">{error}</p>}</div></SettingsGroup><SettingsActions><Button type="button" onClick={() => { setForm(null); setError(''); }}>取消</Button><Button type="submit" className="settings-primary" variant="solid" tone="primary">{form.id ? '保存分组' : '创建分组'}</Button></SettingsActions></Form>;
    return <><SettingsGroup title="当前桌面"><div className="settings-current-desktop"><div><strong>{active.name}</strong><p>{apps} 个应用图标 · {active.layout.length - apps} 张功能卡片</p></div><SettingsActions><Button type="button" onClick={() => navigate(edit)}>{editing ? '继续编辑桌面' : '编辑桌面'}</Button><Button type="button" onClick={() => navigate(library)}>卡片库</Button></SettingsActions></div></SettingsGroup>
  <SettingsGroup title="桌面分组" description="为不同工作安排独立桌面。" action={<Button type="button" className="settings-button" data-settings-link="desktop-group-new" disabled={editing} onClick={() => openForm({ name: '', icon: 'grid' })}><Plus size={14}/>新增分组</Button>}>{editing && <p className="settings-field-note">完成或取消桌面编辑后，即可管理分组。</p>}<div className="settings-group-list">{value.groups.map((group, index) => { const Icon = groupIconComponents[group.icon]; return <div key={group.id} className="settings-group-row"><Button type="button" className="group-select" aria-label={'切换到' + group.name} aria-pressed={group.id === value.activeGroupId} onClick={() => navigate(() => select(group.id))}><Icon size={19}/><span>{group.name}</span>{group.id === value.activeGroupId && <Check size={15}/>}</Button><div className="group-row-actions"><Button type="button" aria-label={'上移' + group.name} disabled={editing || index === 0} onClick={() => change(moveGroup(value, group.id, -1))}><ArrowUp size={15}/></Button><Button type="button" aria-label={'下移' + group.name} disabled={editing || index === value.groups.length - 1} onClick={() => change(moveGroup(value, group.id, 1))}><ArrowDown size={15}/></Button><Button type="button" data-settings-link={'desktop-group-edit:'+group.id} aria-label={'重命名' + group.name} disabled={editing} onClick={() => openForm({ id: group.id, name: group.name, icon: group.icon })}><Pencil size={15}/></Button><Button type="button" aria-label={'删除' + group.name} disabled={editing || value.groups.length === 1} onClick={() => setDeleting(group.id)}><Trash2 size={15}/></Button></div><Dialog open={deleting===group.id} title="删除桌面分组？" description={`删除“${group.name}”及其桌面布局，应用和原始内容保留。`} centered danger closeOnOutside={false} onClose={()=>setDeleting(null)} confirmLabel="删除分组" onConfirm={()=>{if(editing||value.groups.length===1)return false;change(removeGroup(value,group.id));setDeleting(null);}}/></div>; })}</div></SettingsGroup>
 </>;
}
