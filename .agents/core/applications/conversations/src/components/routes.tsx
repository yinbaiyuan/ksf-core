import { useState } from 'react';
import { Archive, ArrowRight, ArrowUpRight, BookOpen, Box, BriefcaseBusiness, ChevronDown, ChevronRight, CircleDot, Compass, FileText, GitBranch, Layers3, Link2, Sparkles, TriangleAlert } from 'lucide-react';
import type { Ability, Ownership, Project, Target, Route, RouteEvent } from '../types';
import { abilityType, agentNames, changed, date, projectName, sourceName, stageNames, timeline, typeNames } from '../model';
import { Button } from '@ksf/sdk/components/ui/button';
import { eventTime, routeEvolution, type EvolutionNode, type RouteChange } from '../route-evolution';
import { ownershipOf, relatedOf, targetIdentity, targetKey, targetTypeNames } from '../targets';
export type Detail = { kind: 'target'; target: Target; label: string; reason: string; at?: string } | { kind: 'ability'; ability: Ability; reason: string; at?: string } | { kind: 'project'; project: Project; label: string; reason: string; at?: string } | { kind: 'event'; event: RouteEvent; changes: string[] } | { kind: 'arrangement'; event: RouteEvent } | { kind: 'reports'; events: RouteEvent[] };
export function markOrigin(element: HTMLElement) { element.closest('[data-window-id]')?.querySelector('[data-detail-origin]')?.removeAttribute('data-detail-origin'); element.setAttribute('data-detail-origin', 'true'); }
const targetIcon = (target: Target) => ({ project: BriefcaseBusiness, knowledge: BookOpen, ability: Compass, archive: Archive })[target.kind];
const targetKinds = ['project', 'knowledge', 'ability', 'archive'] as const;
const relatedLabel = { project: '关联项目', knowledge: '关联知识', ability: '关联能力', archive: '关联档案' };
const icons = { cooperation: GitBranch, partner: Sparkles, competency: Compass, 'data-package': Box };
export function Freshness({ item, context = false }: { item: { freshness?: string; effectiveChanged?: boolean }; context?: boolean }) {
  return changed(item) ? <span className="warning-label"><TriangleAlert size={12} />{context ? item.freshness === 'unavailable' ? '来源现状：不可用' : '来源现状：已变化' : item.freshness === 'unavailable' ? '来源不可用' : '来源已变化'}</span> : null;
}
export function RouteOverview({ route, reason, at, onDetail }: { route: Route; reason: string; at?: string; onDetail: (d: Detail) => void }) {
  const [allStages, setAllStages] = useState(false);
  const ownership = ownershipOf(route), related = relatedOf(route);
  const professional = route.abilities.filter(a => !a.fixed);
  const visible = professional.filter(a => allStages || a.stage === 'adopted');
  function abilityButton(a: Ability) {
    const Icon = icons[abilityType(a) as keyof typeof icons] ?? Box;
    return <button className="ability-row" key={a.id} onClick={e => { markOrigin(e.currentTarget); onDetail({ kind: 'ability', ability: a, reason, at }); }}>
      <Icon size={16} className="row-icon" /><span className="row-copy"><strong>{a.name}</strong><span>{sourceName(a.source)} · v{a.version}</span><Freshness item={a} /></span><span className={`stage stage-${a.stage}`}>{stageNames[a.stage] ?? a.stage}</span><ChevronRight size={14} className="row-chevron" />
    </button>;
  }
  function targetButton(target: Target, label: string) {
    const Icon = targetIcon(target);
    return <button className="project-node" key={targetKey(target)} onClick={e => { markOrigin(e.currentTarget); onDetail({ kind: 'target', target, label, reason, at }); }}>
      <Icon size={18} /><span className="row-copy"><strong>{target.name}</strong><span>{label}{target.kind === 'project' && target.scope === 'archived' ? ' · 已归档' : ''}</span><Freshness item={target} /></span><ArrowUpRight size={14} className="row-chevron" />
    </button>;
  }
  return <section className="route-section" aria-label="路由总览">
    <div className="section-heading"><div><h2 >路由总览</h2><p>查看本轮主归属、关联对象与能力安排</p></div><label className="stage-toggle"><input type="checkbox" checked={allStages} onChange={e => setAllStages(e.target.checked)} />全部阶段</label></div>
    <div className="route-map">
      <div className="map-group project-group"><h3><Layers3 size={14} />归属与关联</h3>{ownership.target ? targetButton(ownership.target, '主归属') : <div className="project-node empty-project"><Layers3 size={18} /><span><strong>{projectName(route)}</strong><small>{ownership.state === 'none' ? '本轮明确无归属' : '等待 Agent 明确归属'}</small></span></div>}
        {targetKinds.map(kind => { const items = related.filter(t => t.kind === kind); return items.length ? <div className="reference-projects" key={kind}><div className="group-label">{relatedLabel[kind]}</div>{items.map(t => targetButton(t, '关联'))}</div> : null; })}
      </div>
      <Connector />
      <div className="task-node"><div className="task-node-icon"><CircleDot size={23} /></div><span className="task-node-label">本轮任务</span><h3>{route.summary}</h3><span className="agent-status"><span className="status-dot" />Agent 上报：{agentNames[route.status] ?? route.status}</span></div>
      <Connector />
      <div className="map-group ability-group"><h3><Layers3 size={14} />能力采用 <span className="count">{visible.length}</span></h3><div className="ability-stack">{['cooperation', 'partner', 'competency', 'data-package'].map(type => {
        const items = visible.filter(a => abilityType(a) === type);
        return items.length ? <div className="ability-type" key={type}><div className="group-label">{typeNames[type]}</div>{items.map(abilityButton)}</div> : null;
      })}{!visible.length && <div className="ability-empty"><Compass size={22} /><p>{professional.length ? '暂未采用专业能力' : '尚未上报专业能力'}</p><span>{professional.length ? '开启“全部阶段”查看已选择和已读取的能力' : '仅展示 Agent 明确上报的安排'}</span></div>}</div>{visible.length > 6 && <p className="ability-scroll-hint">上下滚动查看更多能力</p>}</div>
    </div>
    <div className="map-caption"><Link2 size={13} />连线表示关联与采用关系<span>最近上报 {date(at)}</span></div>
  </section>;
}
function Connector() { return <svg className="route-connector" viewBox="0 0 52 64" aria-hidden="true"><path d="M0 32H52" /><circle cx="26" cy="32" r="3" /></svg>; }
export function ChangeTimeline({ events, onDetail }: { events: RouteEvent[]; onDetail: (d: Detail) => void }) {
  const entries = timeline(events), major = entries.filter(e => e.changes.length), minor = entries.filter(e => !e.changes.length);
  function eventRow({ event, changes }: typeof entries[number], i: number) {
    return <button className="timeline-row" key={event.eventId} onClick={e => { markOrigin(e.currentTarget); onDetail({ kind: 'event', event, changes }); }}><span className="timeline-marker"><CircleDot size={14} /></span><time>{date(event.at)}</time><span className="timeline-copy"><strong>{changes[0] ?? `Agent 状态：${agentNames[event.snapshot.status] ?? event.snapshot.status}`}</strong>{changes.length > 1 && <span>{changes.slice(1).join('；')}</span>}{event.reason && <p>{event.reason}</p>}</span><ChevronRight size={15} /></button>;
  }
  return <section className="changes-section"><div className="section-heading"><div><h2>路由变化</h2><p>保留本轮每一次明确上报的安排</p></div><span className="count">{events.length} 次上报</span></div>
    {major.map(eventRow)}
    {minor.length > 0 && <details className="minor-events"><summary><ChevronRight size={14} />状态更新与重复快照 <span className="count">{minor.length}</span></summary>{minor.map(eventRow)}</details>}
    {!events.length && <p className="quiet-empty">本轮暂无路由上报。</p>}
  </section>;
}
function DefinitionList({ entries }: { entries: [string, string | undefined][] }) { return <dl className="definition-list">{entries.map(([label, value]) => value ? <div key={label}><dt>{label}</dt><dd>{value}</dd></div> : null)}</dl>; }
export function DetailContent({ detail }: { detail: Detail }) {
  if (detail.kind === 'arrangement') return <><div className="detail-type"><GitBranch size={16} />当时完整安排</div><h3 className="detail-name">{detail.event.snapshot.summary}</h3><p className="arrangement-time">记录时间 {eventTime(detail.event.at, true)}</p><SnapshotFacts event={detail.event} /><h4>当时安排说明</h4><p className="detail-reason">{detail.event.reason || '未提供说明。'}</p></>;
  if (detail.kind === 'reports') return <><div className="detail-type"><FileText size={16} />技术信息</div><h3 className="detail-name">原始上报数据</h3><p className="detail-note">此处保留原始事件，包括 Agent 声明状态；不表示宿主实时运行状态。</p><ol className="raw-reports">{detail.events.map(event => <li key={event.eventId}><h4>{eventTime(event.at, true)} · {agentNames[event.snapshot.status] ?? event.snapshot.status}</h4><pre>{JSON.stringify(event, null, 2)}</pre></li>)}</ol></>;
  if (detail.kind === 'ability') {
    const a = detail.ability;
    return <><div className="detail-type"><Compass size={16} />{typeNames[abilityType(a)] ?? '能力'}<span className={`stage stage-${a.stage}`}>{stageNames[a.stage]}</span></div><h3 className="detail-name">{a.name}</h3><Freshness item={a} /><DefinitionList entries={[
      ['来源', sourceName(a.source)], ['版本', `v${a.version}${a.userRevision ? ` · 个人修订 ${a.userRevision}` : ''}`], ['记录时间', detail.at ? eventTime(detail.at, true) : undefined],
    ]} /><h4>当时安排说明</h4><p className="detail-reason">{detail.reason || 'Agent 未提供选择说明。'}</p><p className="detail-note">说明属于本次整体安排；未单独提供的能力选择理由不作推测。</p><details className="technical"><summary><FileText size={14} />技术信息<ChevronDown size={14} /></summary><DefinitionList entries={[
      ['精确引用', a.ref], ['来源标识', a.source], ['定义路径', a.path], ['定义摘要', a.definitionDigest],
    ]} /></details></>;
  }
  if (detail.kind === 'target') {
    const target = detail.target, Icon = targetIcon(target);
    return <><div className="detail-type"><Icon size={16} />{detail.label} · {targetTypeNames[target.kind]}</div><h3 className="detail-name">{target.name}</h3><Freshness item={target} /><DefinitionList entries={[
      ['范围', target.lifecycle === 'planned' ? '待创建目标' : target.kind === 'project' ? target.scope === 'archived' ? '已归档项目' : '当前项目' : targetTypeNames[target.kind]], ['版本', target.kind === 'ability' && target.version ? `v${target.version}` : undefined], ['来源', target.source ? sourceName(target.source) : undefined], ['记录时间', detail.at ? eventTime(detail.at, true) : undefined],
    ]} />{target.lifecycle === 'planned' && <p className="detail-note">当时只确认了目标，尚未建立对应资产。</p>}{target.kind === 'knowledge' && <p className="detail-note">归属记录本轮的主要目标，不表示知识正文已经更新。</p>}{target.kind === 'ability' && <p className="detail-note">这是本轮正在设计或维护的能力；本轮采用的能力另行记录。</p>}{target.currentBinding && <details className="technical"><summary>后续绑定信息<ChevronDown size={14} /></summary><p className="detail-note">后续已建立并绑定目标；此处保留原节点当时的状态。</p><Freshness item={target.currentBinding} /><DefinitionList entries={[["目标", target.currentBinding.name], ["定位", target.currentBinding.path], ["版本", target.currentBinding.version]]} /></details>}<h4>当时安排说明</h4><p className="detail-reason">{detail.reason || 'Agent 未提供说明。'}</p><details className="technical"><summary>技术信息<ChevronDown size={14} /></summary><DefinitionList entries={[[target.kind === 'knowledge' ? '知识入口' : '记录路径', target.path], ['精确引用', target.ref], ['定义摘要', target.definitionDigest], ['归属标识', targetKey(target)], ['身份版本', target.targetVersion ? String(target.targetVersion) : undefined]]} /></details></>;
  }
  if (detail.kind === 'project') return <><div className="detail-type"><BriefcaseBusiness size={16} />{detail.label}</div><h3 className="detail-name">{detail.project.name}</h3><Freshness item={detail.project} /><DefinitionList entries={[
    ['范围', detail.project.scope === 'archived' ? '已归档项目' : '当前项目'], ['记录时间', detail.at ? eventTime(detail.at, true) : undefined],
  ]} /><h4>当时安排说明</h4><p className="detail-reason">{detail.reason || 'Agent 未提供说明。'}</p><details className="technical"><summary>技术信息<ChevronDown size={14} /></summary><DefinitionList entries={[
    ['项目路径', detail.project.path],
  ]} /></details></>;
  return <><div className="detail-type"><GitBranch size={16} />路由事件</div><h3 className="detail-name">{detail.changes[0] ?? '状态更新与重复快照'}</h3><DefinitionList entries={[
    ['上报时间', date(detail.event.at, true)], ['Agent 上报', agentNames[detail.event.snapshot.status] ?? detail.event.snapshot.status], ['主归属', projectName(detail.event.snapshot)],
  ]} />{detail.changes.length > 1 && <ul className="change-list">{detail.changes.slice(1).map((change, i) => <li key={i}>{change}</li>)}</ul>}<h4>当时安排说明</h4><p className="detail-reason">{detail.event.reason || '未提供说明。'}</p><h4>事件中的能力</h4><div className="event-abilities">{detail.event.snapshot.abilities.filter(a => !a.fixed).map(a => <div key={a.id}><strong>{a.name}</strong><span>{stageNames[a.stage]} · {sourceName(a.source)}</span></div>)}{!detail.event.snapshot.abilities.some(a => !a.fixed) && <p className="muted">未上报能力</p>}</div><details className="technical"><summary>完整事件<ChevronDown size={14} /></summary><pre>{JSON.stringify(detail.event, null, 2)}</pre></details></>;
}

function TargetValue({ target, event, label = '主归属', onDetail }: { target: Target; event: RouteEvent; label?: string; onDetail?: (d: Detail) => void }) {
  const Icon = targetIcon(target);
  const name = <><Icon size={13} /><strong>{target.name}{target.kind === 'project' && target.scope === 'archived' && <small>（已归档）</small>}</strong>{target.lifecycle === 'planned' && <small className="target-lifecycle">待创建</small>}<Freshness item={target.currentBinding ?? target} context /></>;
  return onDetail ? <button className="route-value-link" title={`${label}：${target.name} · ${target.path ?? '待创建'}`} onClick={e => { markOrigin(e.currentTarget); onDetail({ kind: 'target', target, label, reason: event.reason, at: event.at }); }}>{name}<ChevronRight size={12} /></button> : <span className="route-value-static">{name}</span>;
}
function AbilityValue({ ability, event, onDetail, definition = false }: { ability: Ability; event: RouteEvent; onDetail?: (d: Detail) => void; definition?: boolean }) {
  const name = <><strong>{ability.name}</strong>{definition && <small>v{ability.version} · {sourceName(ability.source)}</small>}<Freshness item={ability} context /></>;
  return onDetail ? <button className="route-value-link ability-value" onClick={e => { markOrigin(e.currentTarget); onDetail({ kind: 'ability', ability, reason: event.reason, at: event.at }); }}>{name}<ChevronRight size={12} /></button> : <span className="route-value-static">{name}</span>;
}
function Stage({ value }: { value: string }) { return <span className={`stage stage-${value}`}>{stageNames[value] ?? value}</span>; }
function OwnershipState({ ownership, event, onDetail }: { ownership: Ownership; event: RouteEvent; onDetail?: (d: Detail) => void }) {
  return ownership.target ? <TargetValue target={ownership.target} event={event} onDetail={onDetail} /> : <span className="route-project-state">{ownership.state === 'none' ? '无归属' : '待确定'}</span>;
}
function SnapshotFacts({ event, onDetail }: { event: RouteEvent; onDetail?: (d: Detail) => void }) {
  const route = event.snapshot, abilities = route.abilities.filter(a => !a.fixed), related = relatedOf(route);
  return <dl className="route-facts snapshot-facts">
    <div><dt>主归属</dt><dd><OwnershipState ownership={ownershipOf(route)} event={event} onDetail={onDetail} /></dd></div>
    {targetKinds.map(kind => { const items = related.filter(t => t.kind === kind); return items.length ? <div key={kind}><dt>{relatedLabel[kind]}</dt><dd>{items.map(target => <TargetValue key={targetIdentity(target)} target={target} event={event} label="关联对象" onDetail={onDetail} />)}</dd></div> : null; })}
    <div><dt>能力安排</dt><dd>{abilities.length ? <div className="route-ability-groups">{['cooperation', 'partner', 'competency', 'data-package'].map(type => {
      const items = abilities.filter(a => abilityType(a) === type);
      return items.length ? <div className="route-ability-group" key={type}><span className="route-type-label">{typeNames[type]}</span><div>{items.map(a => <div className="snapshot-ability" key={a.id}><AbilityValue ability={a} event={event} onDetail={onDetail} definition={!onDetail} /><Stage value={a.stage} /></div>)}</div></div> : null;
    })}</div> : <span className="route-fact-empty">尚未上报专业能力</span>}</dd></div>
  </dl>;
}
function definitionNotes(before: Ability, after: Ability) {
  const notes: string[] = [];
  if (before.version !== after.version) notes.push(`版本 v${before.version} → v${after.version}`);
  if (before.source !== after.source) notes.push(`${sourceName(before.source)} → ${sourceName(after.source)}`);
  if ((before.userRevision ?? null) !== (after.userRevision ?? null)) notes.push(`个人修订 ${before.userRevision ?? '无'} → ${after.userRevision ?? '无'}`);
  if (before.path !== after.path) notes.push('引用路径调整');
  if (before.definitionDigest !== after.definitionDigest) notes.push('定义内容调整');
  if (before.ref !== after.ref && before.version === after.version) notes.push('精确引用调整');
  return notes.join('；');
}
function EvolutionChange({ change, node, onDetail }: { change: RouteChange; node: EvolutionNode; onDetail: (d: Detail) => void }) {
  const before = node.previous!, after = node.event;
  if (change.kind === 'ownership') return <div className="evolution-change"><span>主归属</span><div><span className="previous-value"><OwnershipState ownership={change.before} event={before} onDetail={onDetail} /></span><ArrowRight size={13} /><OwnershipState ownership={change.after} event={after} onDetail={onDetail} />{change.before.target?.name === change.after.target?.name && change.before.target && change.after.target && <small className="definition-notes">归属类型、范围或入口路径调整</small>}</div></div>;
  if (change.kind === 'related') return <div className="evolution-change"><span>{change.action === 'added' ? '新增关联' : '移出关联'}</span><div><TargetValue target={change.target} event={change.action === 'added' ? after : before} label={relatedLabel[change.target.kind]} onDetail={onDetail} /></div></div>;
  if (change.kind === 'target-updated' || change.kind === 'related-updated') return <div className="evolution-change"><span>{change.binding ? '目标已绑定' : '目标信息'}</span><div><span className="previous-value"><TargetValue target={change.before} event={before} onDetail={onDetail} /></span><ArrowRight size={13} /><TargetValue target={change.after} event={after} onDetail={onDetail} />{change.after.kind === 'ability' && <small className="definition-notes">v{change.after.version} · {sourceName(change.after.source ?? '')}</small>}</div></div>;
  if (change.kind === 'ability-added' || change.kind === 'ability-removed') return <div className="evolution-change"><span>{change.kind === 'ability-removed' ? '移出能力' : '新增能力'}</span><div><AbilityValue ability={change.ability} event={change.kind === 'ability-added' ? after : before} onDetail={onDetail} /><Stage value={change.ability.stage} /></div></div>;
  if (change.kind === 'ability-updated') return <div className="evolution-change"><span>{change.definitionChanged ? '能力定义' : '能力阶段'}</span><div>{change.definitionChanged ? <><span className="previous-value"><AbilityValue ability={change.before} event={before} onDetail={onDetail} definition /><Stage value={change.before.stage} /></span><ArrowRight size={13} /><AbilityValue ability={change.after} event={after} onDetail={onDetail} definition /><Stage value={change.after.stage} /><small className="definition-notes">{definitionNotes(change.before, change.after)}</small></> : <><AbilityValue ability={change.after} event={after} onDetail={onDetail} /><Stage value={change.before.stage} /><ArrowRight size={13} /><Stage value={change.after.stage} /></>}</div></div>;
  return null;
}
export function RouteEvolution({ events, onDetail }: { events: RouteEvent[]; onDetail: (d: Detail) => void }) {
  const nodes = routeEvolution(events);
  if (!nodes.length) return <p className="section-empty">本轮路由未上报。</p>;
  return <ol className="route-evolution" aria-label="本轮路由演进">{nodes.map((node, index) => <li className="evolution-node" key={node.event.eventId}>
    <div className="evolution-heading"><h3>{nodes.length === 1 ? '已确认安排' : node.title}</h3><time dateTime={Number.isFinite(Date.parse(node.event.at)) ? node.event.at : undefined} title={eventTime(node.event.at, true)}>{eventTime(node.event.at)}</time>{nodes.length > 1 && index === nodes.length - 1 && <span className="last-arrangement">末次安排</span>}</div>
    {index === 0 ? <SnapshotFacts event={node.event} onDetail={onDetail} /> : <div className="evolution-changes">{node.changes.map((change, i) => <EvolutionChange key={i} change={change} node={node} onDetail={onDetail} />)}</div>}
    <Button className="arrangement-link" size="sm" onClick={e => { markOrigin(e.currentTarget); onDetail({ kind: 'arrangement', event: node.event }); }}>查看当时完整安排<ArrowUpRight size={12} /></Button>
  </li>)}</ol>;
}
