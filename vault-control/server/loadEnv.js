// Loaded as the FIRST import of server/index.js.
// ESM evaluates every imported module before the importing module's own body,
// so calling dotenv inside index.js would run AFTER routes/services were
// already evaluated — any module reading process.env at load time would see
// nothing. Keeping dotenv in its own module fixes that ordering.
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const here = dirname(fileURLToPath(import.meta.url))
// vault-control/.env first (local overrides), then the repo-root .env that
// ecosystem.config.js, gmail_watcher.py and remote_deploy.sh all treat as the
// single source of truth. dotenv never overwrites a key that is already set,
// so the order gives override semantics. Before this only vault-control/.env
// was read, so keys minted at deploy time (INTERNAL_API_TOKEN) or added to the
// root file (CORS_ORIGIN, post limits) never reached the server.
config({ path: join(here, '../.env') })
config({ path: join(here, '../../.env') })
