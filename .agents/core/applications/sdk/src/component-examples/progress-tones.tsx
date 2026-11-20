import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Progress} from '@ksf/sdk/progress';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ProgressTonesExample(){return <div className='ksf-demo-stack'><Progress value={100} tone='success'/><Progress value={60} tone='warning'/><Progress value={35} tone='error'/></div>;}
