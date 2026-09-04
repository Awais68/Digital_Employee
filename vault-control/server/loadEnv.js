// Loaded as the FIRST import of server/index.js.
// ESM evaluates every imported module before the importing module's own body,
// so calling dotenv inside index.js would run AFTER routes/services were
// already evaluated — any module reading process.env at load time would see
// nothing. Keeping dotenv in its own module fixes that ordering.
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') })
