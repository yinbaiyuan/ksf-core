export interface Issue { code: string; message?: string; taskId?: string }
export interface Project { name: string; scope: 'current' | 'archived'; path: string; freshness?: string }
export type TargetKind = 'project' | 'knowledge' | 'ability' | 'archive';
export interface Target { kind: TargetKind; name: string; path?: string; scope?: 'current' | 'archived'; freshness?: string;
  lifecycle?: 'planned' | 'existing'; targetId?: string; targetVersion?: number; currentBinding?: Target;
  id?: string; ref?: string; source?: string; version?: string; definitionDigest?: string; userRevision?: number | null; entryType?: 'file' | 'directory' }

export interface Ownership { state: string; target?: Target }
export interface Ability { id: string; ref: string; name: string; version: string; source: string; path: string; definitionDigest: string; stage: string; fixed: boolean; freshness?: string; effectiveChanged?: boolean; userRevision?: number }
export interface Route { ownership?: Ownership; relatedTargets?: Target[]; summary: string; status: string; project: { state: string; primary?: Project }; references: Project[]; abilities: Ability[] }
export interface RouteEvent { eventId: string; roundId: string; at: string; reason: string; snapshot: Route }
export interface TurnSummary { targetHistory?: TargetHistory; targetRelation?: ProjectRelation; projectHistory?: ProjectHistory; projectRelation?: ProjectRelation; turnId: string; roundId: string | null; turnNumber?: number; startedAt: string; updatedAt: string; status: string; policy: string; routeCount: number; messageCount: number; preview: string; issues: Issue[]; route?: Route | null }
export interface Task { targetContext?: TargetContext; projectContext?: ProjectContext; taskId: string; title: string; updatedAt: string; createdAt: string; turnCount: number; lastTurn: TurnSummary; latestReported: { turnId: string; roundId: string; turnNumber: number; eventId: string; reportedAt: string; route: Route } | null }
export interface ContentBlock { type: string; text?: string; [key: string]: unknown }
export interface Message { id: string; role: string; phase: string; at: string; content: ContentBlock[]; revisions: { content: ContentBlock[]; at: string; phase: string }[] }
export interface Turn extends TurnSummary { revision: number; messages: Message[]; routes: RouteEvent[]; completedAt: string | null }
export interface Capture { enabled: boolean; activatedAt: string | null; hookConfigured: boolean; lastSync?: { at?: string; errors?: Issue[]; [key: string]: unknown } }
export interface TaskList { records: Task[]; total: number; unfilteredTotal: number; nextOffset: number | null; projects: { value: string; label: string }[]; capture: Capture; errors: Issue[] }
export interface TaskDetail { targetContext?: TargetContext; projectContext?: ProjectContext; errors?: Issue[]; state: string; task: Task; turns: TurnSummary[]; total: number; nextOffset: number | null }
export interface RouteRecord { sessionKey: string; host: string; updatedAt: string; roundId: string; revision: number; current: Route; history: { kind: string; at: string; snapshot: Route; revision: number }[]; historyDropped: number; archive?: string; turnId?: string }
export interface ProjectEntry { key: string; role: string; label: string; project?: Project }
export interface ProjectHistory { entries: ProjectEntry[]; sequence: { key: string; label: string; project?: Project }[]; switched: boolean }
export interface ProjectRelation { kind: string; label: string; matches: boolean }
export interface ProjectContext { key: string; turnCount: number; primaryTurnCount: number; referenceTurnCount: number; latestTurnId: string | null; latestReported: Task['latestReported'] }
export interface TaskProject { key: string; label: string; project: Project | null; chatCount: number; turnCount: number; primaryTurnCount: number; referenceTurnCount: number; lastReportedAt: string | null }
export interface TaskProjects { projects: TaskProject[]; totalChats: number; capture: Capture; errors: Issue[] }

export interface TargetEntry { key: string; role: string; label: string; target?: Target }
export interface TargetHistory { entries: TargetEntry[]; sequence: { key: string; label: string; target?: Target }[]; switched: boolean }
export interface TargetContext { key: string; turnCount: number; relatedTurnCount: number; latestTurnId: string | null; latestReported: Task['latestReported'] }
export interface TaskTarget { aliases?: string[]; key: string; kind: TargetKind | 'state'; lifecycle?: 'planned' | 'existing' | null; label: string; target: Target | null; chatCount: number; turnCount: number; lastReportedAt: string | null }
export interface TaskTargets { targets: TaskTarget[]; totalChats: number; capture: Capture; errors: Issue[] }

export type WorkMetric = 'tasks' | 'turns' | 'projects' | 'knowledge' | 'abilities';
export type WorkPeriod = 'today' | 'week';
export interface WorkTarget { key: string; kind: TargetKind; label: string; lifecycle: 'planned' | 'existing' }
export interface WorkActivity { taskId: string; turnId: string; taskTitle: string; title: string; startedAt: string; navigationTarget: string; primaryTargets: WorkTarget[] }
export interface WorkStatsPeriod { startAt: string; endAt: string; startDate: string; endDate: string; counts: Record<WorkMetric, number> }
export interface WorkStats { generatedAt: string; timeZone: string; today: WorkStatsPeriod; week: WorkStatsPeriod; activity: WorkActivity[]; capture: { enabled: boolean; activatedAt: string | null }; errors: Issue[] }
