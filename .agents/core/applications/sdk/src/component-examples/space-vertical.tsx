import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Space} from '@ksf/sdk/space';
import {TextField} from '@ksf/sdk/text-field';
import {Select} from '@ksf/sdk/select';
import {DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function SpaceVerticalExample(){return <Space direction='column' align='stretch' gap={12}><DemoPanel>条目一</DemoPanel><DemoPanel emphasis>条目二</DemoPanel><DemoPanel>条目三</DemoPanel></Space>;}
