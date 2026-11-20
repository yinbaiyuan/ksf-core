import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {AvatarGroup} from '@ksf/sdk/avatar-group';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function AvatarGroupMixedExample(){return <AvatarGroup label='协作成员' items={[{name:'小林'},{name:'小王'},{name:'小李'},{name:'小陈'},{name:'小周'}]} max={4}/>;}
