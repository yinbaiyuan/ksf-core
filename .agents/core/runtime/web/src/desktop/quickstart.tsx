import {useEffect,useState} from 'react';
import {request} from '../apps/client';
import type {SettingsTab} from './settings-window';
import {settingsError,SettingsGroup,SettingsLink,SettingsStatus,SettingsTechnical} from './settings-controls';

type State={values:{status?:string;operation?:{steps?:{service?:{state:string;error?:{message:string}}}}};details:{root:string}};
type Startup={values:{autostart?:boolean};application:{state:string;error?:{message:string}}};
type AIConfiguration={values:{items?:{enabled?:boolean}[]}};
export function QuickstartContent({select,onDocumentation}:{select:(tab:SettingsTab)=>void;onDocumentation?:()=>void}){
  const [state,setState]=useState<State|null>(null),[startup,setStartup]=useState<Startup|null>(null),[ai,setAI]=useState<string>('正在读取配置…'),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    Promise.all([request<State>('/api/config/incubation'),request<Startup>('/api/config/service'),request<AIConfiguration>('/api/config/ai.connections'),request<AIConfiguration>('/api/config/ai.profiles')]).then(([s,p,c,f])=>{
      if(!active)return;setState(s);setStartup(p);setAI(`已配置 ${c.values.items?.filter(item=>item.enabled!==false).length??0} 个启用连接、${f.values.items?.filter(item=>item.enabled!==false).length??0} 个启用执行配置。`);
    },e=>{if(active)setError(settingsError(e));});
    return()=>{active=false;};
  },[]);
  const deferred=state?.values.operation?.steps?.service?.state==='deferred'&&startup?.application.state!=='immediate';
  return <div className="quickstart-groups">
    <SettingsGroup title="从一句话开始"><div className="settings-detail-summary"><p>直接告诉 Agent 你要做什么：</p><p><strong>记一下：……</strong><br/><strong>帮我推进：……</strong><br/><strong>整理这份材料：……</strong></p></div></SettingsGroup>
    <SettingsGroup title="你的工作空间"><dl><dt>收件箱</dt><dd>接住想法、文件和待处理材料。</dd><dt>项目</dt><dd>组织目标、进展、任务、资料与协作关系。</dd><dt>档案</dt><dd>保存正式资料、凭证和历史记录。</dd><dt>知识</dt><dd>留下经验、认识和可查用的内容。</dd><dt>能力</dt><dd>复用工作方法、执行约定和专业协作。</dd><dt>代码工程</dt><dd>repositories 保存实际工程，也可原位关联已有工程。</dd></dl></SettingsGroup>
    <SettingsGroup title="运行与 AI"><SettingsLink title="运行与后台" description={startup?.values.autostart?'已开启用户登录启动后台':'查看登录启动与后台运行状态'} onClick={()=>select('runtime')}/><SettingsLink title="应用 AI 设置" description={ai} onClick={()=>select('ai')}/>{(deferred||startup?.application.state==='failed')&&<SettingsStatus error>登录启动尚需处理：{startup?.application.error?.message??state?.values.operation?.steps?.service?.error?.message??'请在运行与后台核对。'}</SettingsStatus>}</SettingsGroup>
    <SettingsGroup title="资料与帮助"><SettingsLink title="KSF手册" description={onDocumentation?'完整手册、阅读路线与接口参考':'KSF手册应用尚未启用'} onClick={()=>onDocumentation?.()} disabled={!onDocumentation}/><SettingsTechnical title="实例位置与数据备份"><p>工作台地址：<a href={location.origin+'/'}>{location.origin}/</a></p><p>当前实例：<code>{state?.details.root??'正在读取…'}</code></p><p>材料与设置保存在实例中。完整备份需要包含实例资料和设置，并按应用文档处理后台数据；关联的外部工程分别备份。配置导出只包含部分配置。</p></SettingsTechnical></SettingsGroup>
    {error&&<SettingsStatus error>部分状态读取失败：{error}</SettingsStatus>}
  </div>;
}
