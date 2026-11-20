import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Checkbox,CheckboxGroup} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CheckboxDisabledExample(){return <div className='ksf-demo-stack'><Checkbox label='禁用未选' disabled/><Checkbox label='禁用已选' disabled defaultChecked/><Checkbox label='禁用部分选中' disabled indeterminate/><CheckboxGroup label='整组禁用' disabled options={[{value:'a',label:'选项A'},{value:'b',label:'选项B'}]} defaultValue={['a']}/></div>;}
