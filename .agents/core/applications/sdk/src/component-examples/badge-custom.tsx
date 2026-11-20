import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Badge} from '@ksf/sdk/badge';import {Avatar} from '@ksf/sdk/avatar';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function BadgeCustomExample(){return <div className='ksf-demo-row'><Badge count='新' tone='primary'/><Badge count='✓' tone='success'/><Badge count={12} text='待审资料'/></div>;}
