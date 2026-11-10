# Project upgrade fixtures

These snapshots preserve the first-party Project backends from Core commit
`eb2ffe3f8d759b09d1a8f13fb058a2d7ed3c576b`, versions 0.2.9 and 0.3.4.
They exercise preference retention and Markdown project migration against the
current application. The backend bytes and original package hashes are recorded
in `provenance.json`.

The snapshots use the current unified package format and a minimal frontend
stub. They are test inputs, are absent from the bundled store catalog, and do not
provide an old package reader or historical UI acceptance.
