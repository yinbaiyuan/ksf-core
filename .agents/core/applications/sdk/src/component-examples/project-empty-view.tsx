import {FidelityScope} from '../fidelity/scope';
import Source,{type EmptyStateProps} from '../fidelity/kokonut/empty-state';
export type ProjectEmptyViewProps=EmptyStateProps;
export function ProjectEmptyView(props:ProjectEmptyViewProps){return <FidelityScope module="empty-state"><Source {...props}/></FidelityScope>;}
