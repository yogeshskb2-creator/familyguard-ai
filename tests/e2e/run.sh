#!/usr/bin/env bash
# Build the app against the Firebase emulators, then run the browser E2E suites
# inside `firebase emulators:exec` (emulators start and stop automatically).
set -euo pipefail
cd "$(dirname "$0")/../.."
eval "$(node --input-type=module -e "import {e2eEnv} from './tests/e2e/env.mjs'; for (const [k,v] of Object.entries(e2eEnv)) console.log('export '+k+'='+JSON.stringify(v))")"
npx next build > /dev/null
npx firebase emulators:exec --only auth,firestore --project demo-familyguard \
  "node tests/e2e/auth.e2e.mjs && echo && echo '=== Family E2E ===' && node tests/e2e/family.e2e.mjs && echo && echo '=== Location E2E ===' && node tests/e2e/location.e2e.mjs && echo && echo '=== Map E2E ===' && node tests/e2e/map.e2e.mjs && echo && echo '=== Safety E2E ===' && node tests/e2e/safety.e2e.mjs && echo && echo '=== Assistant E2E ===' && node tests/e2e/assistant.e2e.mjs && echo && echo '=== Devices E2E ===' && node tests/e2e/devices.e2e.mjs && echo && echo '=== Privacy & admin E2E ===' && node tests/e2e/privacy.e2e.mjs"
