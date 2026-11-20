import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Progress} from '@ksf/sdk/progress';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ProgressColorExample(){return <Progress value={65} strokeColor='var(--ksf-color-success)' trailColor='var(--ksf-color-surface)'/>;}
