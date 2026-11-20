import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Select} from '@ksf/sdk/select';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SelectGroupsExample(){return <Select label='分组资料' options={[{value:'a',label:'研究说明',group:'研究资料'},{value:'b',label:'访谈记录',group:'研究资料'},{value:'c',label:'交付清单',group:'交付资料'},{value:'d',label:'尚未开通',group:'交付资料',disabled:true}]}/>;}
