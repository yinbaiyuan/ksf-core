import {FidelityScope} from '../fidelity/scope';
import Source,{type SaveStatusProps} from '../fidelity/kokonut/save-status';
export type AutosaveEditorViewProps=SaveStatusProps;
export function AutosaveEditorView(props:AutosaveEditorViewProps){return <FidelityScope module="save-status"><Source {...props}/></FidelityScope>;}
