import { useRemote } from '../api';
import { KsfLogo } from '../components/ksf-mark';

interface AboutInfo { productName: string; coreVersion: string;installedVersion?:string;candidate?:boolean;sdkCompatibility?:{version:string;minCompatibleVersion:string} }
export function AboutContent() {
  const info = useRemote<AboutInfo>('/api/about');
  return <div className="about-content">
    <div className="about-logo"><KsfLogo /></div>
    <h3 className="about-name">KSF 工作台</h3>
    <p className="about-motto">每一步，都向更高处。</p>
    <div className="about-version" role="status">
      {info.error || (!info.loading && !info.data?.coreVersion) ? <><p>版本信息暂不可用</p><button type="button" onClick={info.refresh}>重试</button></> : info.data?.coreVersion ? <p>Core {info.data.coreVersion}</p> : <p>正在读取版本信息…</p>}
      {info.data?.candidate&&<p>本地候选运行 · 正式安装 {info.data.installedVersion}</p>}
      {info.data?.sdkCompatibility&&<p>SDK API {info.data.sdkCompatibility.version} · 最低兼容 {info.data.sdkCompatibility.minCompatibleVersion}</p>}
    </div>
  </div>;
}
