import {execFile} from 'node:child_process';
import {cpus} from 'node:os';
import {powershell,encodedCommand} from '../platform/windows.js';

export function cpuMilliseconds(text) {
  const match=String(text).match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);
  if(!match)return null;
  return ((Number(match[1]??0)*86400)+(Number(match[2]??0)*3600)+Number(match[3])*60+Number(match[4]))*1000;
}
export function parseDarwinProcesses(text) {
  return text.trim().split('\n').flatMap(line=>{
    const match=line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(.+)$/);
    if(!match)return [];
    const cpuMs=cpuMilliseconds(match[3]);
    return cpuMs===null?[]:[{pid:Number(match[1]),ppid:Number(match[2]),cpuMs,memoryBytes:Number(match[4])*1024,start:match[5].trim().replace(/\s+/g,' ')}];
  });
}
export function parseWindowsProcesses(text) {
  const value=JSON.parse(text.replace(/^\uFEFF/,''));
  return (Array.isArray(value)?value:[value]).filter(Boolean).map(row=>({pid:Number(row.pid),ppid:Number(row.ppid),cpuMs:row.cpuMs===null?null:Number(row.cpuMs),memoryBytes:row.memoryBytes===null?null:Number(row.memoryBytes),start:String(row.start)}));
}
export async function readProcesses(platform=process.platform) {
  const script="$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);$parents=@{};Get-CimInstance Win32_Process|ForEach-Object{$parents[[int]$_.ProcessId]=[int]$_.ParentProcessId};$rows=@(Get-Process|ForEach-Object{try{[pscustomobject]@{pid=$_.Id;ppid=$parents[$_.Id];cpuMs=$_.TotalProcessorTime.TotalMilliseconds;memoryBytes=$_.WorkingSet64;start=$_.StartTime.ToUniversalTime().Ticks.ToString()}}catch{}});ConvertTo-Json -InputObject $rows -Compress";
  const command=platform==='darwin'?'/bin/ps':powershell();
  if(!['darwin','win32'].includes(platform))throw Object.assign(Error('当前平台不支持进程采集。'),{code:'METRICS_PLATFORM_UNSUPPORTED'});
  const args=platform==='darwin'?['-axo','pid=,ppid=,time=,rss=,lstart=']:encodedCommand(script);
  return new Promise((resolve,reject)=>{
    const child=execFile(command,args,{encoding:'utf8',timeout:4000,maxBuffer:8*1024*1024,windowsHide:true,env:{...process.env,LC_ALL:'C'}},(error,stdout)=>{
      if(error){reject(Object.assign(Error('进程资源暂时无法采集。'),{code:'METRICS_READ_FAILED'}));return;}
      try{const rows=platform==='darwin'?parseDarwinProcesses(stdout):parseWindowsProcesses(stdout);resolve(rows.filter(row=>row.pid!==child.pid));}catch(error){reject(error);}
    });
  });
}
/** Request-driven: no timer, process enumeration or disk writes after the last viewer closes. */
export function createProcessMetrics({read=readProcesses,now=Date.now,intervalMs=2000}={}) {
  let previous=new Map(),lastAt=0,pending,cached;
  const history=[];
  async function sample(owners) {
    const at=now(),rows=await read(),byPid=new Map(rows.map(row=>[row.pid,row])),assigned=new Map();
    // More specific owners (application/terminal/AI) override the main service's subtree.
    for(const owner of owners){const root=byPid.get(owner.pid);if(!root||owner.processStart&&root.start!==owner.processStart)continue;assigned.set(root.pid,owner.id);}
    let changed=true;while(changed){changed=false;for(const row of rows)if(!assigned.has(row.pid)&&assigned.has(row.ppid)){assigned.set(row.pid,assigned.get(row.ppid));changed=true;}}
    const processes=[],next=new Map();
    for(const row of rows){const ownerId=assigned.get(row.pid);if(!ownerId)continue;const key=row.pid+':'+row.start,prior=previous.get(key);let cpuPercent=null;
      if(prior&&at>prior.at&&at-prior.at<=intervalMs*3&&row.cpuMs!==null&&row.cpuMs>=prior.cpuMs)cpuPercent=(row.cpuMs-prior.cpuMs)/(at-prior.at)*100;
      if(row.cpuMs!==null)next.set(key,{cpuMs:row.cpuMs,at});
      processes.push({...row,ownerId,cpuPercent});
    }
    previous=next;lastAt=at;
    const total={cpuPercent:processes.length&&processes.every(p=>p.cpuPercent!==null)?processes.reduce((n,p)=>n+p.cpuPercent,0):null,memoryBytes:processes.length&&processes.every(p=>p.memoryBytes!==null)?processes.reduce((n,p)=>n+p.memoryBytes,0):null,processCount:processes.length};
    history.push({at:new Date(at).toISOString(),...total});while(history.length&&(Date.parse(history[0].at)<at-600000||history.length>301))history.shift();
    return cached={at:new Date(at).toISOString(),logicalCPUs:cpus().length,memoryMetric:process.platform==='win32'?'工作集':'RSS',processes,total,history:[...history]};
  }
  return {async sample(owners){if(pending)return pending;if(cached&&now()-lastAt<intervalMs)return cached;pending=sample(owners).finally(()=>{pending=null;});return pending;}};
}
