node-pty 1.1.0, Microsoft / Daniel Imms, MIT. Source: https://github.com/microsoft/node-pty/tree/1.1.0
Official npm distribution prebuilds; Node-API. Native binaries are unchanged. Debug symbols, source maps and TypeScript declarations are excluded. Native execution has been verified only on macOS ARM64 and Windows x64.

KSF applies one JavaScript compatibility patch in `lib/windowsPtyAgent.js`: dispose the console output worker when its output socket closes, including EOF without a final data event. This prevents the ConPTY DLL path from retaining a worker after the terminal has exited. `runtime/tools/vendor-pty.mjs` reapplies the patch to the exact pinned upstream code and refuses an unexpected anchor; native ABI and prebuilt binaries are unchanged.
