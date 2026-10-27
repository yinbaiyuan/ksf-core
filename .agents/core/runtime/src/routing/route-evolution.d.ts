import type { Route, RouteEvent, Ability, Project } from '../../web/src/types.ts';
import type { EvolutionNode, RouteChange } from '../../web/src/route-evolution.ts';
export function routeEvolution(events: RouteEvent[]): EvolutionNode[];
export function arrangementChanges(before: Route, after: Route): RouteChange[];
export function routeSignature(route: Route): string;
export function definitionIdentity(ability: Ability): string;
export function projectIdentity(project: Project): string;
export function eventTime(at: string | undefined, full?: boolean): string;
