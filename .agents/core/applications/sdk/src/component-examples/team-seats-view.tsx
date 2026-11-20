import TeamSeats from '../fidelity/kokonut/team-selector';
import {FidelityScope} from '../fidelity/scope';
export interface TeamSeatMember {id:string;name:string;avatarUrl?:string}
export interface TeamSeatsViewProps {members?:TeamSeatMember[];value?:number;defaultValue?:number;onValueChange?:(value:number)=>void;min?:number;max?:number;label?:string;pricePerSeat?:number;currency?:string}
/** Composition building block; data and pricing policy are owned by the application. */
export function TeamSeatsView({onValueChange,...props}:TeamSeatsViewProps){return <FidelityScope module="team-selector"><TeamSeats {...props} onChange={onValueChange}/></FidelityScope>}
