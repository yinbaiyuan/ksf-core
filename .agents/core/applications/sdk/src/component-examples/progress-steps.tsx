import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Progress} from '@ksf/sdk/progress';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ProgressStepsExample(){return <Progress value={65} steps={10}/>;}
