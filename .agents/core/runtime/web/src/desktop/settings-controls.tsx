import {createContext,useContext,useEffect,useId,useLayoutEffect,useRef,type ReactNode} from 'react';
import {ChevronRight} from 'lucide-react';

export type SettingsDetail={key:string;title:string;back:()=>void};
export type SettingsDraft={dirty:boolean;busy:boolean;discard?:()=>void};
export const SettingsContext=createContext({navigate:(action:()=>void)=>action(),detail:(_value:SettingsDetail|null)=>{},draft:(_id:string,_value:SettingsDraft|null)=>{}});
export function useSettingsNavigation(){return useContext(SettingsContext).navigate;}
export function useSettingsDraft(dirty:boolean,busy=false,discard?:()=>void){
 const {draft}=useContext(SettingsContext),id=useId(),callback=useRef(discard);callback.current=discard;
 useLayoutEffect(()=>{draft(id,{dirty,busy,discard:()=>callback.current?.()});},[draft,id,dirty,busy]);
 useEffect(()=>()=>draft(id,null),[draft,id]);
}
export function useSettingsDetail(key:string|null,title:string,back:()=>void){
 const {detail}=useContext(SettingsContext),callback=useRef(back);callback.current=back;
 useLayoutEffect(()=>{if(!key)return;detail({key,title,back:()=>callback.current()});return()=>detail(null);},[detail,key,title]);
}
export function SettingsGroup({title,description,action,children}:{title:string;description?:string;action?:ReactNode;children:ReactNode}){return <section className="settings-group"><div className="settings-group-heading"><div><h4>{title}</h4>{description&&<p>{description}</p>}</div>{action}</div><div className="settings-group-body">{children}</div></section>;}
export function SettingsLink({title,description,value,onClick,disabled=false}:{title:string;description?:string;value?:ReactNode;onClick:()=>void;disabled?:boolean}){return <button type="button" className="settings-link" data-settings-link={title+'|'+(description??'')} onClick={onClick} disabled={disabled}><span><strong>{title}</strong>{description&&<small>{description}</small>}</span>{value&&<span className="settings-link-value">{value}</span>}<ChevronRight size={16} aria-hidden="true"/></button>;}
export function SettingsStatus({children,error=false}:{children:ReactNode;error?:boolean}){return <p className={`settings-feedback ${error?'is-error':''}`} role={error?'alert':'status'}>{children}</p>;}
export function SettingsEmpty({children}:{children:ReactNode}){return <p className="settings-empty">{children}</p>;}
export function SettingsActions({children}:{children:ReactNode}){return <div className="settings-editor-actions">{children}</div>;}
export function SettingsTechnical({title='技术详情',children}:{title?:string;children:ReactNode}){return <details className="settings-technical"><summary>{title}</summary><div>{children}</div></details>;}
export function settingsError(error:unknown,keepsDraft=false){
 const raw=error instanceof Error?error.message:String(error);
 const text=error instanceof SyntaxError?'配置 JSON 格式不正确，请检查括号和引号。':/Failed to fetch|Load failed|NetworkError|Network request failed/i.test(raw)?'暂时无法连接本地服务，请检查连接后重试。':raw;
 return keepsDraft&&!/保留草稿|草稿.*保留/.test(text)?text.replace(/[。；]+$/u,'')+'；当前草稿已保留。':text;
}
