import {useState} from 'react';
import {View} from '@ksf/sdk/view';
import {Button} from '@ksf/sdk/button';
import {ButtonGroup} from '@ksf/sdk/button-group';
export function ButtonGroupBasicExample() {
  const [sort, setSort] = useState('名称'), [page, setPage] = useState(1);
  return <View style={{gap: 22}}>
    <ButtonGroup label="示例排序" attached>{['名称','更新时间','大小'].map(value => <Button key={value} aria-pressed={sort === value} variant={sort === value ? 'solid' : 'outlined'} tone={sort === value ? 'primary' : 'neutral'} onClick={() => setSort(value)}>按{value}</Button>)}</ButtonGroup>
    <ButtonGroup label="示例翻页"><Button onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page === 1}>上一项</Button><Button onClick={() => setPage(value => value + 1)}>下一项</Button></ButtonGroup>
    <output role="status">按{sort}排序 · 当前第 {page} 项</output>
  </View>;
}
