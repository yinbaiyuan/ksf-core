import {defaultDesktop,defaultMaterialSettings} from '../../../applications/sdk/src/shared/preferences-validation.js';
import {validId} from '../objects/schema.js';
const field=(name,label,type,extra={})=>({name,label,type,...extra});
const domain=(id,label,scope,owner,fields,extra={})=>({id,label,scope,owner,fields,capabilities:['read','check','write','reset','export'],effect:'immediate',...extra});
export const configurationDomains=[
  domain('incubation','首次上手状态','instance','user-data',[],{namespace:'incubation',defaults:{},capabilities:['read'],description:'只读查看首次设置及未决项；初始化操作通过 ksf incubate 管理，不作为普通配置重置或导出。'}),
  domain('identity','本地技术身份','instance','user-data',[field('name','名称','string'),field('email','联系邮箱','string'),field('namespace','能力命名空间','string')],{namespace:'identity',defaults:{},description:'用于技术身份；不验证远程账号，不改写 USER 或已有对象 ID。'}),
  domain('instance','KSF 实例','instance','user-data',[field('name','实例名称','string')],{namespace:'instance',defaults:{},description:'仅作实例显示名称，不改变设备指纹或能力身份。'}),
  domain('program','程序设置','instance','user-data',[field('routing','路由记录','json'),field('updates','显式更新检查参数','json')],{namespace:'settings',defaults:{routing:{enabled:true},updates:{check_interval_seconds:86400,request_timeout_seconds:10}},description:'更新参数仅用于显式系统命令，不启用自动检查或升级。'}),
  domain('collaboration.user','用户协作设定 USER.md','instance','collaboration',[field('text','USER.md 原文','markdown')],{path:'USER.md',defaults:{text:''},effect:'next-read',capabilities:['read','check','write'],description:'保留原文；下次读取协作设定时使用，不自动生成结构化资料。'}),
  domain('collaboration.bot','Agent 协作设定 BOT.md','instance','collaboration',[field('text','BOT.md 原文','markdown')],{path:'BOT.md',defaults:{text:''},effect:'next-read',capabilities:['read','check','write'],description:'保留原文；不改变宿主权限或授权。'}),
  domain('desktop','桌面分组与卡片','instance','user-data',[field('preferences','桌面布局','json')],{namespace:'desktop',defaults:{preferences:defaultDesktop()},description:'分组、卡片和默认窗口大小由实例保存；窗口焦点与滚动位置仍属浏览器会话。'}),
  domain('appearance','外观与材质','instance','user-data',[field('settings','外观参数','json')],{namespace:'appearance',defaults:{settings:defaultMaterialSettings()},description:'实例统一保存，调整后即时预览。'}),
  domain('ai.connections','AI 连接','mixed','ai',[field('items','连接列表','json')],{path:'.agents/user-data/ai/connections.json',defaults:{items:[]},effect:'new-task',runtime:true,capabilities:['read','check','write','reset','apply','export'],deviceFields:['executablePath','codexHome'],description:'只保存环境变量凭据引用。修改不改变已接收任务的执行快照。'}),
  domain('ai.profiles','AI 执行配置','instance','ai',[field('items','执行配置列表','json')],{path:'.agents/user-data/ai/profiles.json',defaults:{items:[]},effect:'new-task',runtime:true,capabilities:['read','check','write','reset','apply','export']}),
  domain('communication','内网通信','device','communication',['enabled','host','port','pairingPort','discovery','maxMessageBytes','maxParts','maxStorageBytes'].map(name=>field(name,({enabled:'启用内网通信',host:'本机 IPv4 地址',port:'监听端口',pairingPort:'配对端口',discovery:'局域网发现',maxMessageBytes:'单条消息上限（字节）',maxParts:'部件上限',maxStorageBytes:'暂存上限（字节）'})[name],['enabled','discovery'].includes(name)?'boolean':['host'].includes(name)?'string':'number')),{path:'.agents/user-data/communication/config.json',runtime:true,capabilities:['read','check','write','reset','apply','export'],description:'本机接口与监听参数；信任、私钥和通道授权不属于普通配置。'}),
  domain('device','本机设备名称','device','communication',[field('name','本机设备名称','string')],{path:'.agents/runtime-data/communication/device-profile.json',runtime:true,capabilities:['read','check','write','apply','export'],description:'内网显示名，与 KSF 实例名称分别维护。'}),
  domain('service','后台启动','device','service',[field('autostart','用户登录后启动后台','boolean')],{path:'.agents/runtime-data/service/policy.json',runtime:true,defaults:{autostart:null},capabilities:['read','check','write','reset','apply','export'],description:'服务端口只读展示；启动项由操作系统适配管理。'}),
  domain('capture','对话正文归档','device','task-capture',[field('enabled','启用正文归档','boolean')],{path:'.agents/runtime-data/task-capture/config.json',defaults:{enabled:false},description:'关闭不删除历史；再次启用不补采停用期间开始的轮次。轮次追踪与正文归档分别管理。'}),
  domain('sources','能力源关联','device','sources',[],{namespace:'sources',capabilities:['read'],defaults:{entries:[]},description:'关联和解除使用 ksf source link/unlink；由源管理模块核实路径、协议和身份。'}),
];
export function configurationDomain(id){
  const found=configurationDomains.find(item=>item.id===id);if(found)return structuredClone(found);
  if(typeof id==='string'&&id.startsWith('ability:')&&validId(id.slice(8)))return domain(id,'能力独立配置','instance','user-data',[],{objectId:id.slice(8),defaults:{},effect:'next-read',capabilities:['read','check','write','reset'],description:'普通 JSON 设置；字段由能力定义约定，不作为新的执行指令。'});
  throw Object.assign(new Error('未知配置领域。'),{code:'CONFIG_DOMAIN_UNKNOWN',status:404});
}
