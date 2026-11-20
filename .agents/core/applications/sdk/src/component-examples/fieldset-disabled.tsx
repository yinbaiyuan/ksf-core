import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Fieldset} from '@ksf/sdk/fieldset';import {Checkbox} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FieldsetDisabledExample(){return <Fieldset legend='通知设置' disabled><Checkbox label='任务完成'/><Checkbox label='评审更新'/></Fieldset>;}
