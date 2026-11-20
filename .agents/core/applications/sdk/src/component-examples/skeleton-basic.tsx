import {useState,useRef,useEffect} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Skeleton} from '@ksf/sdk/skeleton';
export function SkeletonBasicExample(){return <Skeleton avatar active rows={3}/>;}
