import {forwardRef,type ButtonHTMLAttributes} from 'react';
import Source from './fidelity/kokonut/command-button';
import {FidelityScope} from './fidelity/scope';
import './fidelity/styles/command-button.css';
export interface CommandButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>{shortcut?:string;shortcutScope?:'window'|'button'}
export const CommandButton=forwardRef<HTMLButtonElement,CommandButtonProps>(function CommandButton({shortcut='mod+k',shortcutScope='window',...props},ref){return <FidelityScope module="command-button" inline><Source {...props} shortcut={shortcut} global={shortcutScope==='window'} controlRef={ref}/></FidelityScope>;});
