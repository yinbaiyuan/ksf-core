/** Finite adapters for explicit shared rebuilds. Existing bundled packages keep their private renderer. */
export {Button,type LegacyButtonProps} from './compat-button';
export {Sheet,type SheetProps} from './compat-sheet';
export {WindowToolbar,type WindowAction,type WindowToolbarProps} from './compat-toolbar';
export {useContextMenu,copyText,type ContextAction} from './compat-menu';
export {LegacyUIBoundary} from './compat-boundary';
export {mountReact,useApplicationSDK} from './compat-react';
export {WindowContext,useWindowContext,useWindowState,useApplicationMenu,useApplicationSettings,readingPositions,cloneWindowSession,releaseWindowSession} from '@ksf/sdk/window-context';
