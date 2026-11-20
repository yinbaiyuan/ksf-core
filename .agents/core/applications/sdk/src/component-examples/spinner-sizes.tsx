import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Spinner} from '@ksf/sdk/spinner';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SpinnerSizesExample(){return <div className='ksf-demo-row'>{(['small','medium','large'] as const).map(size=><Spinner key={size} size={size} label={size}/>)}</div>;}
