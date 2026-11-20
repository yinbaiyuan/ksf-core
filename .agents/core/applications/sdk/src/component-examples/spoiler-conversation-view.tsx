import Source from '../fidelity/kokonut/spoiler-text';import {SpoilerText} from '../spoiler-text';import {FidelityScope} from '../fidelity/scope';import '../fidelity/styles/spoiler-text.css';
/** Fixed-source fictional conversation; only its hidden-text rendering uses the public KSF primitive. */
export function SpoilerConversationView(){return <FidelityScope module="spoiler-text"><Source renderHidden={(text,key,onReveal)=><SpoilerText key={key} text={text} onRevealedChange={value=>{if(value)onReveal();}}/>}/></FidelityScope>;}
