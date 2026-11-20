import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {FloatButton,FloatButtonGroup,BackToTop} from '@ksf/sdk/float-button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FloatButtonBadgeExample(){return <div className='ksf-demo-row'><FloatButton floating={false} label='消息' badge={5}>信</FloatButton><FloatButton floating={false} label='新增' variant='solid' tone='primary'>＋</FloatButton></div>;}
