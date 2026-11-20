import {useState} from 'react';import Source from '../fidelity/kokonut/synced-transcript';import {FidelityScope} from '../fidelity/scope';
export function TranscriptReviewView({empty=false}:{empty?:boolean}={}){return <FidelityScope module="synced-transcript" style={{maxWidth:448,marginInline:'auto'}}><Source segments={empty?[]:undefined}/></FidelityScope>;}
