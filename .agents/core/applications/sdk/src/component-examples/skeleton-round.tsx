import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Skeleton} from '@ksf/sdk/skeleton';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SkeletonRoundExample(){return <div className='ksf-demo-row'><Skeleton shape='button' round/><Skeleton shape='input' round/></div>;}
