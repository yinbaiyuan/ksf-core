import { useRemote } from '../api';
import { KsfLogo } from '../components/ksf-mark';

interface AboutInfo { productName: string; coreVersion: string }
export function AboutContent() {
  const info = useRemote<AboutInfo>('/api/about');
  return <div className="about-content">
    <div className="about-logo"><KsfLogo /></div>
    <h3 className="about-name">KSF 工作台</h3>
    <p className="about-motto">每一步，都向更高处。</p>
    <div className="about-version" role="status">
      {info.error || (!info.loading && !info.data?.coreVersion) ? <><p>版本信息暂不可用</p><button type="button" onClick={info.refresh}>重试</button></> : info.data?.coreVersion ? <p>Core {info.data.coreVersion}</p> : <p>正在读取版本信息…</p>}
    </div>
  </div>;
}
