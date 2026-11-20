import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Progress} from '@ksf/sdk/progress';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ProgressFormatExample(){return <Progress value={65} format={(_,p)=><span>已完成 {Math.round(p)} / 100</span>}/>;}
