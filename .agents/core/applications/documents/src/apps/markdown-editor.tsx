import MarkdownEditor, { type MarkdownEditorProps } from '@ksf/sdk/apps/markdown-editor';
import { composeDocument, editDocument, saveDocument } from './document-store';

type Props = Omit<MarkdownEditorProps, 'onEdit' | 'onSave' | 'onComposition'>;
export default function DocumentMarkdownEditor(props: Props) {
  return <MarkdownEditor {...props} onEdit={text => editDocument(props.path, text)}
    onSave={() => void saveDocument(props.path)} onComposition={active => composeDocument(props.path, active)} />;
}
