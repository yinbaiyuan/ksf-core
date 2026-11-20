import Source from '../fidelity/kokonut/receipt-printer';import {FidelityScope} from '../fidelity/scope';
/** Paper simulation only; no print service or file export. */
export function ReceiptPrinterView({autoPrint=true,empty=false}:{autoPrint?:boolean;empty?:boolean}={}){return <FidelityScope module="receipt-printer" style={{maxWidth:288,marginInline:'auto'}}><Source autoPrint={autoPrint} items={empty?[]:undefined}/></FidelityScope>;}
