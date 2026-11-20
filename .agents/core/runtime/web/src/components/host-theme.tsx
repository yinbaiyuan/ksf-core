import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {useMaterial} from '../../../../applications/sdk/src/components/material-provider';

const HostThemeContext=createContext('host-theme-light');
export function HostThemeProvider({children}:{children:ReactNode}) {
  const {settings}=useMaterial();
  const [systemDark,setSystemDark]=useState(()=>matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(()=>{
    const media=matchMedia('(prefers-color-scheme: dark)'),changed=()=>setSystemDark(media.matches);
    changed();media.addEventListener('change',changed);
    return()=>media.removeEventListener('change',changed);
  },[]);
  const dark=settings.themeMode==='dark'||(settings.themeMode!=='light'&&systemDark);
  return <HostThemeContext.Provider value={dark?'host-theme-dark':'host-theme-light'}>{children}</HostThemeContext.Provider>;
}
/** Explicitly applied to host-owned portals; application surfaces keep their own theme. */
export const useHostTheme=()=>useContext(HostThemeContext);
