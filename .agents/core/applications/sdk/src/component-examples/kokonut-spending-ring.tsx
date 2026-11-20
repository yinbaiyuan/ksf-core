import {SpendingRingView} from '@ksf/sdk/component-examples/spending-ring-view';
export default function Example(){return <SpendingRingView title="本月支出（模拟）" currency="CNY" categories={[{name:'日常用品',amount:580,change:-6.1,tone:'primary'},{name:'出行',amount:420,change:12.8,tone:'success'},{name:'其他',amount:280,change:0,tone:'warning'}]}/>}
