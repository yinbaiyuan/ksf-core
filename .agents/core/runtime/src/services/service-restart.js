import {liveIdentity} from './service-lock.js';
import {ensureService} from './service-manager.js';
const [root,pid,processStart,port]=process.argv.slice(2),deadline=Date.now()+20000;
while(liveIdentity({pid:Number(pid),processStart})&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
if(liveIdentity({pid:Number(pid),processStart}))throw Error('旧服务尚未退出，未启动替代进程。');
await ensureService(root,{reason:'restart',...(port===undefined?{}:{port:Number(port)})});
