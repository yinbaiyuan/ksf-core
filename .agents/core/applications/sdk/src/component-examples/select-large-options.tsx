import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Select} from '@ksf/sdk/select';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SelectLargeOptionsExample(){return <Select label='项目编号' options={Array.from({length:100},(_,i)=>({value:String(i+1),label:'项目 '+String(i+1).padStart(3,'0')}))}/>;}
