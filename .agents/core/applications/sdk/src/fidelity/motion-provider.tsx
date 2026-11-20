import {AnimatePresence as BasePresence,MotionConfig as BaseConfig} from 'motion/react';
import type {ComponentProps} from 'react';
import {useWindowContext} from '../window-context';

/** Motion stays in the optional motion graph; its generated styles use the owning host's nonce. */
export function MotionConfig(props:ComponentProps<typeof BaseConfig>){
 const {styleNonce}=useWindowContext();
 return styleNonce?<BaseConfig {...props} nonce={styleNonce}/>:<BaseConfig {...props}/>;
}

/** popLayout inserts a stylesheet from inside AnimatePresence, before the exiting child is removed. */
export function AnimatePresence(props:ComponentProps<typeof BasePresence>){
 const {styleNonce}=useWindowContext();
 return styleNonce?<BaseConfig nonce={styleNonce}><BasePresence {...props}/></BaseConfig>:<BasePresence {...props}/>;
}
