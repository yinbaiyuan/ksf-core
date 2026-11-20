import CollectionSave from '../fidelity/kokonut/save-button';
import {FidelityScope} from '../fidelity/scope';
export interface SavedCollection {id:string;name:string;count:number;color:string}
export interface CollectionSaveViewProps {collections:SavedCollection[];onCollectionsChange?:(items:SavedCollection[])=>void;savedCollection:string|null;onSavedCollectionChange:(id:string|null)=>void;defaultCollection?:string}
/** Local composition view. Persistence and access checks belong to its application. */
export function CollectionSaveView(props:CollectionSaveViewProps){return <FidelityScope module="save-button" inline><CollectionSave {...props}/></FidelityScope>}
