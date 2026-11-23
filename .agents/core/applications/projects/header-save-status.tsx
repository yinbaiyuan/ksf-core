import {SaveStatus,type SaveStatusProps} from '@ksf/sdk/save-status';

export function HeaderSaveStatus({message,...props}:SaveStatusProps){
 const detail=props.status==='saved'&&/^已(?:自动)?保存[。.!！]?$/.test(message?.trim()??'')?undefined:message;
 return <div className="project-header-save-status" title={message}><SaveStatus {...props} message={detail}/></div>;
}
