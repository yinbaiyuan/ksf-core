import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Skeleton} from '@ksf/sdk/skeleton';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SkeletonRowsExample(){return <Skeleton rows={5} widths={['100%','90%','80%','95%','55%']}/>;}
