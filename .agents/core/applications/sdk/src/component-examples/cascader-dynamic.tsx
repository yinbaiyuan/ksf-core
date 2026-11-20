import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Cascader} from '@ksf/sdk/cascader';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CascaderDynamicExample(){const [loaded,setLoaded]=useState(false);return <Cascader label='动态地区' onBrowsePathChange={path=>{if(path[0]==='east')setLoaded(true);}} options={[{value:'east',label:'华东',children:loaded?[{value:'hangzhou',label:'杭州'},{value:'shanghai',label:'上海'}]:[{value:'loading',label:'请选择华东以载入',disabled:true}]}]}/>;}
