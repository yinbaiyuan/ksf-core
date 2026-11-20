import {validVersion,compareVersions} from '../applications/protocol.js';
import {assert} from '../services/workbench-common.js';

// Core explicitly owns the workbench protocol it can serve. Application API compatibility is separate.
export const SUPPORTED_WORKBENCH_CONTRACTS=Object.freeze(['ksf-workbench-v1']);
export function assertFrontendHost(runtime,{coreVersion,contracts=SUPPORTED_WORKBENCH_CONTRACTS}={}) {
  assert(['ksf-frontend-runtime-v1','ksf-ui-runtime-v1'].includes(runtime?.protocol)&&/^[a-f0-9]{64}$/.test(runtime?.frontendReleaseId??''),'UI_FRONTEND_INVALID','完整前端身份无效。',409);
  const value=runtime.hostCompatibility;
  assert(validVersion(coreVersion)&&value&&validVersion(value.minimumCoreVersion)&&validVersion(value.maximumCoreVersionExclusive)&&compareVersions(value.minimumCoreVersion,value.maximumCoreVersionExclusive)<0,'UI_HOST_CONTRACT_INVALID','前端快照缺少明确的宿主兼容范围。',409);
  assert(contracts.includes(value.workbenchContract),'UI_WORKBENCH_INCOMPATIBLE','当前 Core 未核准此工作台前端协议。',409);
  assert(compareVersions(coreVersion,value.minimumCoreVersion)>=0&&compareVersions(coreVersion,value.maximumCoreVersionExclusive)<0,'UI_CORE_INCOMPATIBLE',`此完整前端快照需要 Core ${value.minimumCoreVersion} 至 ${value.maximumCoreVersionExclusive}（不含上界）。`,409);
}
