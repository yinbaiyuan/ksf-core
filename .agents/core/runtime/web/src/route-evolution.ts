import type { Ability, Project, Ownership, Target, Route, RouteEvent } from './types.ts';

import { ownershipOf, relatedOf, ownershipIdentity, targetIdentity, targetKey, targetDetails } from './targets.ts';

export type RouteChange =
  | { kind: 'ownership'; before: Ownership; after: Ownership }
  | { kind: 'target-updated' | 'related-updated'; before: Target; after: Target; binding: boolean }
  | { kind: 'related'; action: 'added' | 'removed'; target: Target }
  | { kind: 'ability-added' | 'ability-removed'; ability: Ability }
  | { kind: 'ability-updated'; before: Ability; after: Ability; stageChanged: boolean; definitionChanged: boolean };
export interface EvolutionNode { event: RouteEvent; previous?: RouteEvent; changes: RouteChange[]; title: string }

export { eventTime, projectIdentity, definitionIdentity, routeSignature, arrangementChanges, routeEvolution } from '../../src/routing/route-evolution.js';
