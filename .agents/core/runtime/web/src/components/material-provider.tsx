import {createContext,useContext,useState,type ReactNode} from 'react';
import {MaterialContext} from '../../../../applications/sdk/src/components/material-provider.tsx';
import {appearancePreferences,useInstancePreferences} from '../instance-preferences';
import {HostThemeProvider} from './host-theme';
import type {MaterialSettings} from '../material-settings';
const AppearancePreviewContext=createContext({setPreview:(_value:MaterialSettings|null)=>{}});
export const useAppearancePreview=()=>useContext(AppearancePreviewContext);
export {useMaterial,useMaterialStyle,MaterialContext} from '../../../../applications/sdk/src/components/material-provider.tsx';
export function MaterialProvider({children}:{children:ReactNode}){
 const state=useInstancePreferences(appearancePreferences);
 const [preview,setPreview]=useState<MaterialSettings|null>(null);
 const saved=state.status;
 const committed=appearancePreferences.getSaveSnapshot().committed?.value.value,base=appearancePreferences.isManualEditing?committed??state.value:state.value;
 return <AppearancePreviewContext.Provider value={{setPreview}}><MaterialContext.Provider value={{settings:preview??base,update:appearancePreferences.update,saved}}><HostThemeProvider>{children}</HostThemeProvider></MaterialContext.Provider></AppearancePreviewContext.Provider>;
}
