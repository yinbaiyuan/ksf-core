#!/bin/sh
set -eu
ksfRoot=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
exec /bin/sh "$ksfRoot/.agents/ksf" service stop --json
