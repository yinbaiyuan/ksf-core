import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {FloatButton,FloatButtonGroup,BackToTop} from '@ksf/sdk/float-button';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FloatButtonShapesExample(){return <div className='ksf-demo-row'><FloatButton floating={false} label='新增'>＋</FloatButton><FloatButton floating={false} label='帮助' shape='square' description='帮助'>?</FloatButton></div>;}
