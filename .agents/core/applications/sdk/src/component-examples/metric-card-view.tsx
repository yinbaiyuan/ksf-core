import {EmptyState} from '../empty-state';
import Source,{type MetricCardProps} from '../fidelity/kokonut/metric-card';import {FidelityScope} from '../fidelity/scope';import '../fidelity/styles/metric-card.css';
export type MetricCardViewProps=MetricCardProps;
/** Local simulation and presentation only; all supplied data belongs to the application. */
export function MetricCardView(props:MetricCardViewProps){const periods=props.periods?.filter(n=>Number.isFinite(n)&&n>=1).map(Math.floor);const validPeriods=periods?.length?periods:[7,30,90];const defaultPeriod=validPeriods.includes(props.defaultPeriod??30)?props.defaultPeriod??30:validPeriods[0];const currency=/^[A-Za-z]{3}$/.test(props.currency??'USD')?props.currency:'USD';return <FidelityScope module="metric-card">{props.data?.length===0?<EmptyState heading="没有指标数据" description="由应用提供统计序列。"/>:<Source {...props} periods={validPeriods} defaultPeriod={defaultPeriod} currency={currency}/>}</FidelityScope>;}
