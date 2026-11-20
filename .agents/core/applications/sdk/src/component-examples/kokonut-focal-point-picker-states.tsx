import {FocalPointPicker} from '@ksf/sdk/focal-point-picker';
import {landscapeImage} from '@ksf/sdk/component-examples/demo-media';

export default function Example(){return <FocalPointPicker label="只读焦点" src={landscapeImage} alt="本地原创场景图" value={{x:1.2,y:-.3}} disabled/>;}
