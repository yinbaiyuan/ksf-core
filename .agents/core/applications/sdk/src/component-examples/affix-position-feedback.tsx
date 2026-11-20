import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Affix} from '@ksf/sdk/affix';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function AffixPositionFeedbackExample(){const sticky=useRef<HTMLDivElement>(null),[pinned,setPinned]=useState(false);return <div className='ksf-demo-stack'><output>{pinned?'已到固定位置':'尚未固定'}（应用监听此容器滚动）</output><div style={{height:220,overflow:'auto',border:'1px solid var(--ksf-color-border)',padding:12}} onScroll={event=>setPinned((sticky.current?.getBoundingClientRect().top??Infinity)-event.currentTarget.getBoundingClientRect().top<=14)}><div style={{height:90}}>先滚动上方内容</div><Affix ref={sticky} offset={12}><DemoPanel emphasis>固定内容</DemoPanel></Affix><div style={{height:450}}>继续向下滚动</div></div></div>;}
