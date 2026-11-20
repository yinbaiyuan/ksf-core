import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Link} from '@ksf/sdk/link';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function LinkExternalExample(){return <div className='ksf-demo-stack'><Link href='https://ant.design/components/' target='_blank' rel='nofollow'>查看参考组件库 ↗</Link><span>新标签页链接补充noopener／noreferrer，不在此示例自动导航。</span></div>;}
