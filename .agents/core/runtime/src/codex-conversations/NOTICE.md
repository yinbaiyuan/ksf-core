KSFAssistant protocol port

The Desktop IPC framing, owner/follower operations, draft handoff sequence,
canonical history ordering and async question envelope in this directory were
ported to Node from KSFAssistant, under its MIT license.

Reference: KSFAssistant/Core/internal/{desktop,integration,codex}, local project
repository supplied by the user (no origin remote configured).
Reference HEAD: 82b000ccbfda1e03f79eb35e9235cac8d89e26c8; source working tree has local changes.
Observed CLI: 0.163.0-alpha.11.1. Desktop IPC is a private compatibility adapter,
not an officially stable public OpenAI API. Re-run contract and macOS live
acceptance before adopting a new Desktop version. Unknown protocols fail
closed. This adapter does not read or copy authentication files.

Source file SHA-256 (actual local sources, 2026-10-28):
- Core/internal/desktop/activity.go: 665fe4a4c28a4a901a7ae41893cf3889a313c1ba75a311f7c0af9d688f937a7b
- Core/internal/desktop/observation_cache.go: 61f7d1908cfe8ec9cb98713d0994f1898d4280caefe442653c5ac8d941e83fb1
- Core/internal/desktop/async_input.go: 9f45838360a5bdb07dee41719d372d669cd47b78675e3f6448e0c6a0c7a1344f
- Core/internal/codex/client.go: 03bea54727a8788cef75d3bf14980d24f5efb4e547c0e4cf9fa8450dca19b022
- Core/internal/integration/inbound_runtime.go: 7cba8b45b3ea3b1a1b23af58557a1f5a2e73215eb48c008fa52437f976356a7d

MIT License

Copyright (c) 2026 KSFAssistant contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
