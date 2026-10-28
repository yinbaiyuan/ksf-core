import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { currentGroup, groupIcons, groupNameError, moveGroup, removeGroup, type DesktopPreferences, type GroupIcon } from '../desktop-model';
import { randomId } from '../random-id';
import { groupIconComponents, groupIconNames } from './sidebar';

type Editor = { id?: string; name: string; icon: GroupIcon };
export function GroupManager({ value, change, select, startNew, editing, edit, library }: { value: DesktopPreferences; change: (value: DesktopPreferences) => void; select: (id: string) => void; startNew: boolean; editing: boolean; edit: () => void; library: () => void }) {
  const [form, setForm] = useState<Editor | null>(() => startNew && !editing ? { name: '', icon: 'grid' } : null), [error, setError] = useState(''), [deleting, setDeleting] = useState<string | null>(null);
  const active = currentGroup(value);
  function save(event: FormEvent) {
    event.preventDefault(); if (!form || editing) return;
    const problem = groupNameError(form.name, value.groups, form.id); if (problem) { setError(problem); return; }
    const id = form.id ?? 'group-' + randomId();
    const groups = form.id ? value.groups.map(group => group.id === id ? { ...group, name: form.name.trim(), icon: form.icon } : group) : [...value.groups, { id, name: form.name.trim(), icon: form.icon, layout: [] }];
    change({ ...value, groups, activeGroupId: form.id ? value.activeGroupId : id }); setForm(null); setError('');
  }
  function openForm(next: Editor) { setDeleting(null); setError(''); setForm(next); }
  return <div className="group-manager">
    <div className="settings-section"><div className="settings-section-heading"><div><h4>当前桌面</h4><p>{active.name} · {active.layout.length} 张卡片</p></div></div><div className="settings-desktop-actions"><button type="button" onClick={edit}>{editing ? '继续编辑桌面' : '编辑桌面'}</button><button type="button" onClick={library}>卡片库</button></div></div>
    <div className="settings-section"><div className="settings-section-heading"><div><h4>桌面分组</h4><p>为不同的工作安排独立桌面。</p></div><button type="button" className="settings-add-group" disabled={editing} onClick={() => openForm({ name: '', icon: 'grid' })}><Plus size={15} />新增分组</button></div>
      {editing && <p className="settings-notice">完成或取消当前桌面编辑后，即可管理分组。</p>}
      {form && <form className="group-editor" onSubmit={save}>
        <label htmlFor="desktop-group-name">{form.id ? '重命名分组' : '新建分组'}</label>
        <input id="desktop-group-name" autoFocus value={form.name} placeholder="输入分组名称" aria-invalid={!!error} aria-describedby={error ? 'group-name-error' : undefined} onChange={event => { setForm({ ...form, name: event.target.value }); setError(''); }} />
        <fieldset><legend>分组图标</legend><div className="group-icon-picker">{groupIcons.map(icon => { const Icon = groupIconComponents[icon]; return <button key={icon} type="button" aria-label={groupIconNames[icon] + '图标'} aria-pressed={form.icon === icon} onClick={() => setForm({ ...form, icon })}><Icon size={20} /></button>; })}</div></fieldset>
        {error && <p id="group-name-error" role="alert">{error}</p>}
        <div className="settings-form-actions"><button type="button" onClick={() => { setForm(null); setError(''); }}>取消</button><button type="submit" className="settings-primary">{form.id ? '保存名称与图标' : '创建分组'}</button></div>
      </form>}
      <div className="settings-group-list">{value.groups.map((group, index) => { const Icon = groupIconComponents[group.icon]; return <div key={group.id} className="settings-group-row">
        <button type="button" className="group-select" aria-label={'切换到' + group.name} aria-pressed={group.id === value.activeGroupId} onClick={() => select(group.id)}><Icon size={19} /><span>{group.name}</span>{group.id === value.activeGroupId && <Check size={15} />}</button>
        <div className="group-row-actions"><button type="button" aria-label={'上移' + group.name} disabled={editing || index === 0} onClick={() => change(moveGroup(value, group.id, -1))}><ArrowUp size={15} /></button><button type="button" aria-label={'下移' + group.name} disabled={editing || index === value.groups.length - 1} onClick={() => change(moveGroup(value, group.id, 1))}><ArrowDown size={15} /></button><button type="button" aria-label={'重命名' + group.name} disabled={editing} onClick={() => openForm({ id: group.id, name: group.name, icon: group.icon })}><Pencil size={15} /></button><button type="button" aria-label={'删除' + group.name} disabled={editing || value.groups.length === 1} onClick={() => { setForm(null); setDeleting(group.id); }}><Trash2 size={15} /></button></div>
        {deleting === group.id && <div className="group-delete-confirm" role="alert"><p>删除“{group.name}”及其卡片布局？原始内容仍会保留。</p><div><button type="button" onClick={() => setDeleting(null)}>取消</button><button type="button" className="settings-danger" onClick={() => { change(removeGroup(value, group.id)); setDeleting(null); }}>确认删除分组</button></div></div>}
      </div>; })}</div>
    </div>
  </div>;
}
