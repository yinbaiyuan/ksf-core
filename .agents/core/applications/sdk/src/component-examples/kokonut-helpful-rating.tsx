import {useState} from 'react';
import {FeedbackRatingView} from '@ksf/sdk/component-examples/feedback-rating-view';
export default function Example(){const [result,setResult]=useState('');return <div style={{width:'100%'}}><FeedbackRatingView question="这条示例回答对你有帮助吗？" onSubmit={value=>setResult('已记录 '+value.rating+' / 5，仅保存本地演示状态。')}/><output aria-live="polite">{result}</output></div>}
