import {WheelPicker} from '@ksf/sdk/wheel-picker';
export default function Example(){return <div style={{display:'flex',gap:24,flexWrap:'wrap',alignItems:'start'}}><WheelPicker label="禁用滚轮" disabled options={[{value:'a',label:'早上'},{value:'b',label:'晚上'}]} defaultValue="a"/><WheelPicker label="空选项" options={[]}/></div>;}
