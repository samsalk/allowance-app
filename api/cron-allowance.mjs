// Weekly allowance, run by Vercel Schedules (see "schedules" in vercel.json).
// A `function` target has no public URL and only Vercel's scheduler can invoke
// it, so there is no secret to check. Runs are not retried, but that's fine:
// dueDates() pays every week since lastAllowanceDate, so the next run (or the
// app's catch-up screen) picks up anything missed. Re-delivery is also safe --
// once paid, nothing is due and the write is ETag-guarded.
import { handleSchedule } from '@vercel/schedules';
import store from '../lib/store.js';
import weekly from '../lib/weekly-allowance.js';

const MAX_RETRIES = 3;

export const POST = handleSchedule(async (metadata) => {
    const { readData, writeData } = store;
    const { dueDates, applyAllowanceToAppData } = weekly;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const { data, etag } = await readData();
        const due = dueDates(data);
        if (due.length === 0) {
            console.log(`${metadata.name} ${metadata.executionId}: no allowance due`);
            return;
        }

        applyAllowanceToAppData(data, due);
        const result = await writeData(data, etag);
        if (result.ok) {
            console.log(`${metadata.name} ${metadata.executionId}: applied ${due.length} week(s) for ${data.kids.length} kid(s)`);
            return;
        }
        console.log(`Version conflict on attempt ${attempt}; retrying`);
    }

    throw new Error('Could not apply allowance: repeated version conflicts');
});
