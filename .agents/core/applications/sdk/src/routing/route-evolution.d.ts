import type { Route, RouteEvent, Ability, Project, Ownership, Target } from '../types';
export type RouteChange =
  | { kind: 'ownership'; before: Ownership; after: Ownership }
  | { kind: 'target-updated' | 'related-updated'; before: Target; after: Target; binding: boolean }
  | { kind: 'related'; action: 'added' | 'removed'; target: Target }
  | { kind: 'ability-added' | 'ability-removed'; ability: Ability }
  | { kind: 'ability-updated'; before: Ability; after: Ability; stageChanged: boolean; definitionChanged: boolean };
export interface EvolutionNode { event: RouteEvent; previous?: RouteEvent; changes: RouteChange[]; title: string }
export function routeEvolution(events: RouteEvent[]): EvolutionNode[];
export function arrangementChanges(before: Route, after: Route): RouteChange[];
export function routeSignature(route: Route): string;
export function definitionIdentity(ability: Ability): string;
export function projectIdentity(project: Project): string;
export function eventTime(at: string | undefined, full?: boolean): string;
