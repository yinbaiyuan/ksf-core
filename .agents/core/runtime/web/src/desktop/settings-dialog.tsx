import {useMemo,useRef} from 'react';
import {Dialog,type DialogProps} from '@ksf/sdk/dialog';
import {View} from '@ksf/sdk/view';
import {WindowContext,useWindowContext} from '@ksf/sdk/window-context';
import {useHostTheme} from '../components/host-theme';
import {overlays} from '../overlay-coordinator';
import {globalOverlayRoot} from '../overlay-runtime';
/** Host bridge only: use the existing global stack for desktop-origin settings confirmations. */
export function SettingsDialog(props:DialogProps){
 const theme=useHostTheme(),inherited=useWindowContext(),root=useRef(document.body as unknown as HTMLDivElement);
 const context=useMemo(()=>({...inherited,id:'workbench',root,overlayHost:globalOverlayRoot(),overlays}),[inherited]);
 return <WindowContext.Provider value={context}><View theme={theme==='host-theme-dark'?'dark':'light'} style={{display:'contents'}}><Dialog {...props}/></View></WindowContext.Provider>;
}
