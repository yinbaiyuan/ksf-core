import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Affix} from '@ksf/sdk/affix';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function AffixScrollTargetExample(){return <div style={{height:230,overflow:'auto',border:'1px solid var(--ksf-color-border)',padding:12}}><DemoPanel style={{marginBottom:12}}>向下滚动此容器。</DemoPanel><Affix offset={12}><DemoPanel emphasis>固定在容器顶部12px</DemoPanel></Affix><div style={{height:500,paddingTop:16}}>其余滚动内容</div></div>;}
