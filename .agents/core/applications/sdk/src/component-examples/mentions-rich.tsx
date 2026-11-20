import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Mentions} from '@ksf/sdk/mentions';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function MentionsRichExample(){return <Mentions label='提及协作者' options={[{value:'design',label:'设计',description:'界面与交互'},{value:'research',label:'研究',description:'需求与验证'},{value:'build',label:'开发'},{value:'blocked',label:'暂不可用',disabled:true}]} renderOption={o=><span><strong>@{o.label}</strong><small style={{display:'block'}}>{o.description}</small></span>}/>;}
