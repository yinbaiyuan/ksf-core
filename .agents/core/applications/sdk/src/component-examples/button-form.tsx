import {useState} from 'react';
import {View} from '@ksf/sdk/view';
import {Button} from '@ksf/sdk/button';

export function ButtonFormExample() {
  const [submits, setSubmits] = useState(0);
  const [clicks, setClicks] = useState(0);
  return <View style={{gap: 20, background: 'transparent'}}>
    <form onSubmit={event => {event.preventDefault(); setSubmits(value => value + 1);}}
      style={{display: 'grid', gap: 16, justifyItems: 'start'}}>
      <label style={{display: 'grid', gap: 6}}>示例内容
        <input name="example" defaultValue="一条示例记录" required/>
      </label>
      <View direction="row" style={{gap: 12, flexWrap: 'wrap', background: 'transparent'}}>
        <Button onClick={() => setClicks(value => value + 1)}>普通点击</Button>
        <Button type="submit" variant="solid" tone="primary">提交示例</Button>
        <Button type="reset" variant="text" tone="primary">还原内容</Button>
      </View>
    </form>
    <output aria-live="polite">普通点击 {clicks} 次 · 表单提交 {submits} 次</output>
  </View>;
}
