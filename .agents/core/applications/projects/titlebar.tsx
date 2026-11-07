import { useLayoutEffect, useRef, useState } from 'react';
import { ClipboardList, FileText, List, LocateFixed, MessageSquare, Sparkles } from 'lucide-react';
import { mountReact, useApplicationSDK, type ApplicationSDK } from '@ksf/sdk/react';
import { useWindowContext } from '@ksf/sdk/window-context';
import { WindowToolbar } from '@ksf/sdk/window-toolbar';
import { useContextMenu } from '@ksf/sdk/components/ui/context-menu';
import { Sheet } from '@ksf/sdk/components/ui/sheet';

interface ProjectActions {
  inspirationPanel: {node:HTMLElement;owner:string;close():void}|null;
  navigation: HTMLElement | null;
  projectActions: {
    planLabel: string | null;
    planDisabled: boolean;
    reviewLabel: string | null;
    reviewDisabled: boolean;
    inspirationDisabled: boolean;
    plan(): void;
    review(): void;
    prepare: (() => void) | null;
    focus: (() => void) | null;
    inspiration(): void;
  } | null;
  canReturn: boolean;
  busy: boolean;
  showCatalog(): void;
  refresh(): void;
}

function InspirationContent({node}:{node:HTMLElement}){
  const host=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    host.current?.append(node);
    const frame=requestAnimationFrame(()=>node.querySelector<HTMLTextAreaElement>('textarea')?.focus({preventScroll:true}));
    return()=>{cancelAnimationFrame(frame);node.remove();};
  },[node]);
  return <div ref={host} className="pg-inspiration-host"/>;
}

type MountContent = (
  container: HTMLElement,
  sdk: ApplicationSDK,
  updateActions: (actions: ProjectActions) => void,
  contextMenu: ReturnType<typeof useContextMenu>['bind'],
) => { dispose(): void };

function ObjectNavigation({ node }: { node: HTMLElement }) {
  const host = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    host.current?.append(node);
    return () => node.remove();
  }, [node]);

  return <div ref={host} className="kp-toolbar-navigation-slot" />;
}

export function mountProjectWindow(container: HTMLElement, sdk: ApplicationSDK, mountContent: MountContent) {
  function ProjectWindow() {
    const app = useApplicationSDK();
    const { toolbarHost } = useWindowContext();
    const content = useRef<HTMLDivElement>(null);
    const [commands, setCommands] = useState<ProjectActions | null>(null);
    const contextMenu = useContextMenu();

    useLayoutEffect(() => {
      if (!content.current) return;
      const mounted = mountContent(content.current, app, setCommands, contextMenu.bind);
      return () => mounted.dispose();
    }, [app]);

    useLayoutEffect(() => {
      // The workbench renders a static title before the toolbar slot.
      const title = toolbarHost?.previousElementSibling;
      if (!(title instanceof HTMLElement) || !title.classList.contains('window-title')) return;
      const display = title.style.display;
      title.style.display = 'none';
      return () => { title.style.display = display; };
    }, [toolbarHost]);

    const projectActions = commands?.projectActions;
    const inspirationPanel = commands?.inspirationPanel;
    const inspirationAction = {
      id: 'inspiration', label: '灵感闪现', icon: Sparkles, priority: 100,
      pressed: !!inspirationPanel,
      disabled: !inspirationPanel && !!projectActions?.inspirationDisabled,
      onAction: () => { if (inspirationPanel) inspirationPanel.close(); else projectActions?.inspiration(); },
    };
    return <>
      <WindowToolbar label="项目快捷操作" object={{ title: 'KSF项目' }}
        navigation={<>
          <button type="button" className="kp-toolbar-title" title="刷新项目" aria-label="KSF项目，刷新项目"
            disabled={!commands || commands.busy} aria-busy={commands?.busy || undefined} onClick={() => commands?.refresh()}>
            KSF项目
          </button>
          <button type="button" className="kp-toolbar-catalog" title="全部项目" aria-label="全部项目"
            disabled={!commands?.canReturn} onClick={() => commands?.showCatalog()}>
            <List size={16} />
          </button>
          {commands?.navigation && <ObjectNavigation node={commands.navigation} />}
        </>}
        actions={projectActions ? [
          ...(projectActions.planLabel ? [
            { id: 'plan', label: projectActions.planLabel, icon: ClipboardList, disabled: projectActions.planDisabled, onAction: projectActions.plan },
          ] : []),
          ...(projectActions.prepare ? [
            { id: 'prepare', label: '准备推进对话', icon: MessageSquare, disabled: projectActions.planDisabled, onAction: projectActions.prepare },
          ] : []),
          ...(projectActions.focus ? [
            { id: 'focus', label: '定位重点', icon: LocateFixed, disabled: projectActions.planDisabled, onAction: projectActions.focus },
          ] : []),
          ...(projectActions.reviewLabel ? [
            { id: 'review', label: projectActions.reviewLabel, icon: FileText, disabled: projectActions.reviewDisabled, onAction: projectActions.review },
          ] : []),
          inspirationAction,
        ] : inspirationPanel ? [inspirationAction] : []} />
      <div ref={content} className="kp-projects-host" />
      <Sheet open={!!commands?.inspirationPanel} onOpenChange={open=>{if(!open)commands?.inspirationPanel?.close();}}
        title="灵感闪现" description={commands?.inspirationPanel?.owner} side="right" solid showClose={false} showHeader={false} className="pg-inspiration-drawer">
        {commands?.inspirationPanel&&<InspirationContent node={commands.inspirationPanel.node}/>}
      </Sheet>
      {contextMenu.menu}
    </>;
  }

  return mountReact(ProjectWindow, container, sdk);
}
