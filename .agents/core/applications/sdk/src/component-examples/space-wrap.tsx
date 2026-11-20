import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Space} from '@ksf/sdk/space';
import {TextField} from '@ksf/sdk/text-field';
import {Select} from '@ksf/sdk/select';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SpaceWrapExample(){return <Space wrap gap='10px 8px'>{Array.from({length:12},(_,i)=><Button key={i}>操作{i+1}</Button>)}</Space>;}
