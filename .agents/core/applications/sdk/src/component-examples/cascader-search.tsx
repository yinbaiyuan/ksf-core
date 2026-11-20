import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Cascader} from '@ksf/sdk/cascader';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CascaderSearchExample(){return <Cascader label='交付地区' options={[{value:'east',label:'华东',children:[{value:'hangzhou',label:'杭州',children:[{value:'xihu',label:'西湖区'},{value:'yuhang',label:'余杭区'}]},{value:'shanghai',label:'上海'}]},{value:'south',label:'华南',children:[{value:'shenzhen',label:'深圳'}]}]} searchable description='支持输入杭州或完整路径，选择搜索结果提交。'/>;}
