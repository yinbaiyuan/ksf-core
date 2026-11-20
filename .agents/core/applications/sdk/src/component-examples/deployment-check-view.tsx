import {FidelityScope} from '../fidelity/scope';
import Source,{type InlineAlertProps} from '../fidelity/kokonut/inline-alert';
export type DeploymentCheckViewProps=InlineAlertProps;
export function DeploymentCheckView(props:DeploymentCheckViewProps){return <FidelityScope module="inline-alert"><Source {...props}/></FidelityScope>;}
