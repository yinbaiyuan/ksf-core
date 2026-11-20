// Read-only verification of historical complete frontend snapshots. Never used for application SDK admission.
// Pure public contract, shared by SDK tools, Core and the browser. No renderer dependency.
export const UI_CONTRACT_VERSION = '1.0.0';
export const UI_RENDERER_FAMILY = 'ksf-react-v1';
export const UI_BEHAVIOR_VERSION = '1.0.0';
// This legacy mapping is permanent even when a later SDK changes its build default.
export const UI_LEGACY_BEHAVIOR_VERSION='1.0.0';
export const UI_SUPPORTED_BEHAVIOR_VERSIONS=Object.freeze([UI_BEHAVIOR_VERSION]);
export const UI_SHARED_MIN_CORE_VERSION = '0.6.0';
export const UI_RUNTIME_MODULES=Object.freeze([
  {source:'@ksf/sdk/ui',name:'ui',entry:'ksf-ui',feature:null},
  {source:'@ksf/sdk/ui/bridge',name:'ui-bridge',entry:'ksf-ui-bridge',feature:'ui.save'},
  {source:'@ksf/sdk/ui/ai',name:'ui-ai',entry:'ksf-ui-ai',feature:'ui.ai'},
  {source:'@ksf/sdk/ui/domain',name:'ui-domain',entry:'ksf-ui-domain',feature:'ui.domain'},
  {source:'@ksf/sdk/ui/desktop',name:'ui-desktop',entry:'ksf-ui-desktop',feature:'ui.desktop'},
  {source:'@ksf/sdk/files',name:'ui-files',entry:'ksf-ui-files',feature:'ui.files'},
  {source:'@ksf/sdk/ui/compat',name:'ui-compat',entry:'ksf-ui-compat',feature:'ui.legacy'},
  {source:'react',name:'react',entry:'ksf-react',feature:null},
  {source:'react-dom',name:'react-dom',entry:'ksf-react-dom',feature:null},
  {source:'react-dom/client',name:'react-dom-client',entry:'ksf-react-dom-client',feature:null},
  {source:'react/jsx-runtime',name:'jsx-runtime',entry:'ksf-jsx-runtime',feature:null},
].map(item=>Object.freeze({...item,specifier:`@ksf/runtime/${item.name}/v1`})));
export const UI_RUNTIME_SPECIFIERS = Object.freeze(UI_RUNTIME_MODULES.map(item=>item.specifier));
export const UI_RUNTIME_EXPORT_FEATURES=Object.freeze({
  '@ksf/runtime/ui/v1':Object.freeze({UIProvider:'ui.provider',MotionPolicy:'ui.policy',useUI:'ui.provider',uiRootAttributes:'ui.provider',DEFAULT_UI_CONFIGURATION:'ui.policy',DEFAULT_SYSTEM_PREFERENCES:'ui.policy',UI_CONTRACT_VERSION:'ui.compatibility',UI_RENDERER_FAMILY:'ui.compatibility',mergeUIConfiguration:'ui.policy',resolveUIConfiguration:'ui.policy',validateUIRequirements:'ui.compatibility',validateUIRuntime:'ui.compatibility',checkUICompatibility:'ui.compatibility',selectUIBehavior:'ui.compatibility',UI_BEHAVIOR_VERSION:'ui.compatibility',UI_SUPPORTED_BEHAVIOR_VERSIONS:'ui.compatibility',getUIRuntime:'ui.provider',mountReact:'ui.provider',useApplicationSDK:'ui.provider',OverlayHost:'ui.overlay',ShortcutScope:'ui.commands',loadUIFeature:'ui.loader',SettingsPage:'ui.settings',ProjectWorkspace:'ui.project-workspace',RunWorkspace:'ui.run-workspace',...Object.fromEntries(['Button','Link','Field','Input','Textarea','Select','Checkbox','RadioGroup','Switch','Slider','NumberInput','Badge','Tooltip','DropdownMenu','ContextMenu','Popover','Dialog','AlertDialog','Sheet','InlineAlert','Toast','Progress','Skeleton','Disclosure'].map(name=>[name,'ui.primitives'])),...Object.fromEntries(['PageLayout','NavigationList','Surface','Toolbar','Tabs','SplitPane','Form','SearchFilterBar','DataList','ContentState','SaveStatus','ResourcePicker','ResourceList','ContentPreview'].map(name=>[name,'ui.composites']))}),
  '@ksf/runtime/ui-ai/v1':Object.freeze(Object.fromEntries(['PromptComposer','RunStatus','ToolCallList','InputRequest','ApprovalRequest','ResultView'].map(name=>[name,'ui.ai']))),
  '@ksf/runtime/ui-domain/v1':Object.freeze(Object.fromEntries(['ProjectSummary','TaskItem','MilestoneSummary'].map(name=>[name,'ui.domain']))),
  '@ksf/runtime/ui-desktop/v1':Object.freeze(Object.fromEntries(['DesktopBackdrop','DesktopArea','AppIcon','WidgetFrame','TopBar','Taskbar','AppLauncher','WindowFrame','NotificationCenter'].map(name=>[name,'ui.desktop']))),
  '@ksf/runtime/ui-compat/v1':Object.freeze(Object.fromEntries(['Button','Sheet','WindowToolbar','useContextMenu','copyText','LegacyUIBoundary','mountReact','useApplicationSDK','WindowContext','useWindowContext','useWindowState','useApplicationMenu','useApplicationSettings','readingPositions','cloneWindowSession','releaseWindowSession'].map(name=>[name,'ui.legacy']))),
  '@ksf/runtime/ui-files/v1':Object.freeze({createFileClient:'ui.files',createBackendFileClient:'ui.files',createApplicationFileClient:'ui.files'}),
  '@ksf/runtime/ui-bridge/v1':Object.freeze({SaveController:'ui.save',createConfigurationSaveAdapter:'ui.save',createConfigurationMutationSaveAdapter:'ui.save-reset',createApplicationStorageSaveAdapter:'ui.save',classifySaveError:'ui.save',RunController:'ui.run',createAITaskRunAdapter:'ui.run',createDesktopRunAdapter:'ui.run',projectAITask:'ui.run',projectConversation:'ui.run',createSessionSaveAdapter:'ui.session',CloseCoordinator:'ui.session',createSessionCloseGuard:'ui.session',createFileResourceAdapter:'ui.resources',projectFileResource:'ui.resources'}),
});
const identifier = /^[a-z][a-z0-9._-]{0,95}$/;
const version = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const parts = value => {
  if (typeof value !== 'string' || !version.test(value)) throw new TypeError('UI 契约需要完整的语义版本号。');
  const result = value.split('.').map(Number);
  if (!result.every(Number.isSafeInteger)) throw new TypeError('UI 版本号超出安全范围。');
  return result;
};
function features(value) {
  if (!Array.isArray(value) || value.length > 128 || value.some(item => typeof item !== 'string' || !identifier.test(item)) || new Set(value).size !== value.length) {
    throw new TypeError('UI 特性声明必须是有限、唯一的公开标识列表。');
  }
}
export function validateUIRuntime(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('缺少宿主 UI 运行时。');
  parts(value.contractVersion); features(value.features);
  if(value.behaviorVersions!==undefined){if(!Array.isArray(value.behaviorVersions)||!value.behaviorVersions.length||value.behaviorVersions.length>16||new Set(value.behaviorVersions).size!==value.behaviorVersions.length)throw new TypeError('宿主行为目标需要有限、唯一的受支持版本。');value.behaviorVersions.forEach(parts);}
  if (typeof value.rendererFamily !== 'string' || !identifier.test(value.rendererFamily) || typeof value.frontendReleaseId !== 'string' || !/^[a-f0-9]{64}$/.test(value.frontendReleaseId)) throw new TypeError('宿主 UI renderer 或快照身份无效。');
}
