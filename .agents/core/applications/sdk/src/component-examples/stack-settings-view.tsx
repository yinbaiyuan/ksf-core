import {useState} from 'react';import Source from '../fidelity/kokonut/stack-panel';import {StackPanel} from '../stack-panel';
/** Fictional upstream workspace settings; changing values does not affect KSF or system settings. */
export function StackSettingsView(){const [path,setPath]=useState<readonly string[]>(['settings']);return <Source renderPanel={(pages,root)=><StackPanel label="Workspace settings (local simulation)" pages={Object.entries(pages).map(([id,page])=>({id,...page}))} rootId={root} path={path} onPathChange={setPath}/>}/>;}
