import type {OpenApp} from '../apps/app-services';
export interface AppProps {search:URLSearchParams;navigate:(changes:Record<string,string|null>,replace?:boolean)=>void;onDiagnostics:()=>void;openApp?:OpenApp}
export interface WidgetProps {compact?:boolean;visible?:boolean;open:(search:string,fresh?:boolean)=>void}
