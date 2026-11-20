import {randomId} from '@ksf/sdk/random-id';
/** Different renderer roots (including private legacy copies) must never produce colliding useId values. */
export function rootIdentifierPrefix(owner:string,role:string):string {
 return `ksf-${encodeURIComponent(owner)}-${role}-${randomId()}-`;
}
