import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Skeleton} from '@ksf/sdk/skeleton';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SkeletonShapesExample(){return <div className='ksf-demo-row'>{(['button','input','avatar','image'] as const).map(shape=><Skeleton key={shape} shape={shape} active/>)}</div>;}
