import {EmptyState} from '../empty-state';
import Source,{type UptimeCardProps} from '../fidelity/kokonut/uptime-card';import {FidelityScope} from '../fidelity/scope';import '../fidelity/styles/uptime-card.css';
export type UptimeCardViewProps=UptimeCardProps;
/** Local simulation and presentation only; all supplied data belongs to the application. */
export function UptimeCardView(props:UptimeCardViewProps){const days=Math.max(1,Math.min(365,Math.floor(Number.isFinite(props.days)?props.days!:90)));const endDate=props.endDate&&Number.isFinite(Date.parse(props.endDate+'T00:00:00Z'))?props.endDate:undefined;return <FidelityScope module="uptime-card">{props.services?.length===0?<EmptyState heading="没有监测服务" description="由应用提供服务与事件记录。"/>:<Source {...props} days={days} endDate={endDate}/>}</FidelityScope>;}
