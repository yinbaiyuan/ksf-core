// Supported host-runtime entry for Windows Electron's bundled Node >=24.
// The host runs the stable launcher recovery before entering this read bridge.
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runAssistantCommand } from './commands/assistant.js';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
if (Number(process.versions.node.split('.')[0]) < 24 || existsSync(join(root, '.agents/runtime-data/system/transaction'))) {
  process.stdout.write(JSON.stringify({ ok:false, command:'assistant', errors:[{code:'ASSISTANT_RUNTIME_UNAVAILABLE',message:'Node 24+ and completed launcher recovery are required.'}] })+'\n'); process.exitCode=1;
} else {
  const result = await runAssistantCommand(process.argv.slice(2), root);
  process.stdout.write(result.stdout); process.exitCode = result.exitCode;
}
