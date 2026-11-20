import {EmptyState} from '../empty-state';
import Source,{type NowPlayingProps} from '../fidelity/kokonut/liquid-glass-card';import {FidelityScope} from '../fidelity/scope';import '../fidelity/styles/liquid-glass-card.css';
export type NowPlayingViewProps=NowPlayingProps;
/** Local simulation and presentation only; all supplied data belongs to the application. */
export function NowPlayingView(props:NowPlayingViewProps){return <FidelityScope module="liquid-glass-card">{props.tracks?.length===0?<EmptyState heading="没有可播放曲目" description="由应用提供曲目信息与媒体服务。"/>:<Source {...props}/>}</FidelityScope>;}
