import Source,{type SmoothDrawerProps,type OrderItem,type OrderSummary} from '../fidelity/kokonut/smooth-drawer';
import {FidelityScope} from '../fidelity/scope';
export type OrderReviewViewProps=SmoothDrawerProps;
export type {OrderItem,OrderSummary};
export function OrderReviewView(props:OrderReviewViewProps){return <FidelityScope module="smooth-drawer" inline><Source {...props}/></FidelityScope>;}
