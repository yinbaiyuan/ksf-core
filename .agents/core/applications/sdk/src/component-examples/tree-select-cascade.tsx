import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TreeSelect} from '@ksf/sdk/tree-select';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TreeSelectCascadeExample(){return <TreeSelect searchable clearable defaultExpandAll label='项目分类' nodes={[{id:'root',label:'项目',children:[{id:'design',label:'设计',children:[{id:'ui',label:'界面'},{id:'motion',label:'动效'}]},{id:'research',label:'研究'},{id:'disabled',label:'暂不可用',disabled:true}]}]} multiple cascadeChecks defaultValue={['design']}/>;}
