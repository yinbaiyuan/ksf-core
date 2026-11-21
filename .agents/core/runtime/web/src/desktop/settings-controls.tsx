import {createContext,useContext,useEffect,useId,useLayoutEffect,useRef,type ReactNode} from 'react';
import {SettingsChevron,SettingsItemIcon,settingsLinkIcon} from './settings-icons';
import {Button} from '@ksf/sdk/button';
import {Heading,Text} from '@ksf/sdk/typography';
import {InlineAlert} from '@ksf/sdk/inline-alert';
import {EmptyState} from '@ksf/sdk/empty-state';

export type SettingsDetail={key:string;title:string;back:()=>void};
export type SettingsDraft={dirty:boolean;busy:boolean;unresolved?:boolean;discard?:()=>void|boolean|Promise<void|boolean>;save?:()=>boolean|Promise<boolean>};
export const SettingsContext=createContext({navigate:(action:()=>void)=>action(),detail:(_value:SettingsDetail|null)=>{},draft:(_id:string,_value:SettingsDraft|null)=>{}});
export function useSettingsNavigation(){return useContext(SettingsContext).navigate;}
export function useSettingsDraft(dirty:boolean,busy=false,discard?:()=>void|boolean|Promise<void|boolean>,save?:()=>boolean|Promise<boolean>,unresolved=false){
 const {draft}=useContext(SettingsContext),id=useId(),callback=useRef(discard),saveCallback=useRef(save);callback.current=discard;saveCallback.current=save;
 useLayoutEffect(()=>{draft(id,{dirty,busy,unresolved,discard:()=>callback.current?.(),...(save?{save:()=>saveCallback.current?.()??false}:{})});},[draft,id,dirty,busy,!!save,unresolved]);
 useEffect(()=>()=>draft(id,null),[draft,id]);
}
export function useSettingsDetail(key:string|null,title:string,back:()=>void){
 const {detail}=useContext(SettingsContext),callback=useRef(back);callback.current=back;
 useLayoutEffect(()=>{if(!key)return;detail({key,title,back:()=>callback.current()});return()=>detail(null);},[detail,key,title]);
}
export function SettingsGroup({title,description,action,children}:{title?:string;description?:string;action?:ReactNode;children:ReactNode}){return <section className="settings-group"><div className="settings-group-heading"><div>{title&&<Heading level={3}>{title}</Heading>}{description&&<Text as="p" tone="muted">{description}</Text>}</div>{action}</div><div className="settings-group-body">{children}</div></section>;}
export function SettingsLink({title,description,value,onClick,disabled=false}:{title:string;description?:string;value?:ReactNode;onClick:()=>void;disabled?:boolean}){return <Button variant="text" className="settings-link" data-settings-link={title+'|'+(description??'')} onClick={onClick} disabled={disabled}><span className="settings-link-icon"><SettingsItemIcon kind={settingsLinkIcon(title)}/></span><span className="settings-link-copy"><Text>{title}</Text>{description&&<Text size="small" tone="muted">{description}</Text>}</span>{value&&<span className="settings-link-value">{value}</span>}<SettingsChevron width={16} height={16} aria-hidden="true"/></Button>;}
export function SettingsStatus({children,error=false}:{children:ReactNode;error?:boolean}){return <InlineAlert tone={error?'error':'info'}>{children}</InlineAlert>;}
export function SettingsEmpty({children}:{children:ReactNode}){return <EmptyState compact illustration={false} description={children}/>;}
export function SettingsActions({children}:{children:ReactNode}){return <div className="settings-editor-actions">{children}</div>;}
export function SettingsTechnical({title='技术详情',children}:{title?:string;children:ReactNode}){return <details className="settings-technical"><summary>{title}</summary><div>{children}</div></details>;}
export function settingsError(error:unknown,keepsDraft=false){
 const raw=error instanceof Error?error.message:String(error);
 const text=error instanceof SyntaxError?'配置 JSON 格式不正确，请检查括号和引号。':/Failed to fetch|Load failed|NetworkError|Network request failed/i.test(raw)?'暂时无法连接本地服务，请检查连接后重试。':raw;
 return keepsDraft&&!/保留草稿|草稿.*保留/.test(text)?text.replace(/[。；]+$/u,'')+'；当前草稿已保留。':text;
}
