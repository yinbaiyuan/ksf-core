import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Progress} from '@ksf/sdk/progress';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ProgressSquareExample(){return <Progress value={65} round={false}/>;}
