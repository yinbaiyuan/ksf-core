import Helpful from '../fidelity/kokonut/helpful-rating';
import {FidelityScope} from '../fidelity/scope';
export interface FeedbackRatingResult {rating:number;reasons:string[];note:string}
export function FeedbackRatingView({question,onSubmit}:{question:string;onSubmit?:(feedback:FeedbackRatingResult)=>void}){return <FidelityScope module="helpful-rating"><Helpful question={question} onSubmit={onSubmit}/></FidelityScope>}
