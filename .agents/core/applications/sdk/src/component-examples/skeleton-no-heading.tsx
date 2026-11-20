import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Skeleton} from '@ksf/sdk/skeleton';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SkeletonNoHeadingExample(){return <Skeleton heading={false} rows={3}/>;}
