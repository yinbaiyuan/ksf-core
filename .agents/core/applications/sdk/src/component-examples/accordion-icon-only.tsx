import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Accordion} from '@ksf/sdk/accordion';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function AccordionIconOnlyExample(){return <Accordion items={[{id:'scope',title:'交付范围',content:'组件、示例与公共 API。'},{id:'rules',title:'使用约定',content:'使用 KSF 主题和窗口机制。'},{id:'disabled',title:'未开放内容',content:'后续范围',disabled:true}]} expandOn='icon'/>;}
