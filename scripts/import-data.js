#!/usr/bin/env node
// One-time import of an existing data export into the Vercel Blob store.
//   vercel env pull .env.local            (gets BLOB_READ_WRITE_TOKEN)
//   node --env-file=.env.local scripts/import-data.js backup.json
// Accepts either the bare { kids, settings, transactions } object or an
// object wrapping it as { data: {...} } (e.g. a SQL-editor export row).
// Refuses to overwrite data that already exists.
const fs = require('fs');
const { writeData, readData } = require('../lib/store');

(async () => {
    const file = process.argv[2];
    if (!file) { console.error('Usage: import-data.js <backup.json>'); process.exit(1); }

    let parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(parsed)) parsed = parsed[0];
    const data = parsed.data && parsed.data.kids ? parsed.data : parsed;
    if (!Array.isArray(data.kids) || !Array.isArray(data.transactions) || !data.settings) {
        console.error('File does not look like { kids, settings, transactions }.');
        process.exit(1);
    }

    const existing = await readData();
    if (existing.etag) { console.error('Blob already has data -- refusing to overwrite.'); process.exit(1); }

    const result = await writeData(data, null);
    if (!result.ok) { console.error('Write conflict.'); process.exit(1); }
    console.log(`Imported ${data.kids.length} kid(s), ${data.transactions.length} transaction(s).`);
})();
