import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {DescriptionList} from '@ksf/sdk/description-list';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DescriptionListVerticalBorderExample(){return <DescriptionList items={[{id:'name',label:'项目名称',content:'KSF 组件库'},{id:'owner',label:'负责人',content:'小林'},{id:'status',label:'状态',content:'进行中'},{id:'scope',label:'范围',content:'首版组件、同源示例与公共 API',span:2}]} orientation='vertical' bordered/>;}
