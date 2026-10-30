import type {ReactNode} from 'react';
import {MaterialContext} from '../../../../applications/sdk/src/components/material-provider.tsx';
import {appearancePreferences,useInstancePreferences} from '../instance-preferences';
export {useMaterial,useMaterialStyle,MaterialContext} from '../../../../applications/sdk/src/components/material-provider.tsx';
export function MaterialProvider({children}:{children:ReactNode}){
 const state=useInstancePreferences(appearancePreferences);
 const saved=state.status==='conflict'||state.status==='loading'?'failed':state.status;
 return <MaterialContext.Provider value={{settings:state.value,update:appearancePreferences.update,saved}}>{children}</MaterialContext.Provider>;
}
