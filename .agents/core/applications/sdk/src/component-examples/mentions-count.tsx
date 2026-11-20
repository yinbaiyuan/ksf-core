import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Mentions} from '@ksf/sdk/mentions';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function MentionsCountExample(){return <Mentions label='讨论' options={[{value:'design',label:'设计',description:'界面与交互'},{value:'research',label:'研究',description:'需求与验证'},{value:'build',label:'开发'},{value:'blocked',label:'暂不可用',disabled:true}]} autoSize minRows={2} maxRows={5} maxLength={120} showCount defaultValue='请 @design 查看新方案'/>;}
