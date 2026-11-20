import {Redaction} from '@ksf/sdk/redaction';
export default function Example(){return <Redaction title="失败恢复" defaultValue="联系 demo@example.com" onSubmit={()=>Promise.reject(new Error('本地模拟失败，请重试'))}/>;}
