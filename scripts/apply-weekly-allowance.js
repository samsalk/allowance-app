#!/usr/bin/env node
// Applies weekly allowance on a schedule (.github/workflows/weekly-allowance.yml),
// independent of anyone opening the app -- see the login-gated app.js's
// checkAndAddWeeklyAllowance() for the client-side fallback path. Mirrors
// app.js's addWeeklyAllowance(), reusing the shared allowance-logic.js math
// so the rules can't silently drift between the app and this job.
const { createClient } = require('@supabase/supabase-js');
const allowanceLogic = require('../allowance-logic.js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
    process.exit(1);
}

// service_role bypasses RLS -- appropriate here since this runs only in a
// trusted CI environment via a repo secret, never shipped to the browser.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MAX_RETRIES = 3;

async function run() {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const { data: row, error: fetchError } = await supabase
            .from('family_data')
            .select('data, version')
            .eq('id', 1)
            .single();

        if (fetchError) {
            console.error('Failed to fetch family_data:', fetchError.message);
            process.exit(1);
        }

        const appData = row.data;

        const due = dueDates(appData);
        if (due.length === 0) {
            console.log('No allowance due -- nothing to do.');
            return;
        }

        applyAllowanceToAppData(appData, due);

        const { data: updatedRows, error: updateError } = await supabase
            .from('family_data')
            .update({ data: appData, version: row.version + 1, updated_at: new Date().toISOString() })
            .eq('id', 1)
            .eq('version', row.version)
            .select();

        if (updateError) {
            console.error('Failed to save family_data:', updateError.message);
            process.exit(1);
        }

        if (updatedRows && updatedRows.length > 0) {
            console.log(`Applied ${due.length} week(s) of allowance for ${appData.kids.length} kid(s).`);
            return;
        }

        console.log(`Version conflict on attempt ${attempt} (a device saved in between) -- retrying.`);
    }

    console.error('Could not apply allowance after retries due to repeated version conflicts.');
    process.exit(1);
}

// Every scheduled due instant since the last payment. Usually one; more than
// one means earlier runs were missed (e.g. Supabase paused), and they are all
// paid here rather than silently skipped.
function dueDates(appData) {
    if (!appData.settings.lastAllowanceDate) return [];
    const allowanceDay = appData.settings.allowanceDay || 'sunday';
    return allowanceLogic.scheduledAllowancesBetween(
        new Date(appData.settings.lastAllowanceDate), new Date(), allowanceDay);
}

function applyAllowanceToAppData(appData, due) {
    due.forEach((dueDate, i) => {
        const catchUp = due.length > 1;
        appData.kids.forEach(kid => {
            const age = allowanceLogic.calculateAge(kid.birthday);
            const distribution = allowanceLogic.distributeAllowance(age, appData.settings.rotationWeek);

            kid.balances.save += distribution.save;
            kid.balances.spend += distribution.spend;
            kid.balances.share += distribution.share;

            appData.transactions.unshift({
                id: Date.now() + kid.id + i,
                date: new Date().toISOString(),
                kidId: kid.id,
                kidName: kid.name,
                bucket: 'all',
                amount: age,
                description: catchUp
                    ? `Weekly allowance for week of ${dueDate.toISOString().slice(0, 10)} (catch-up)`
                    : 'Weekly allowance',
                type: 'allowance'
            });
        });

        appData.settings.rotationWeek = allowanceLogic.nextRotationWeek(appData.settings.rotationWeek);
    });

    // Stamp the last due instant paid, not "now", so a late run can't push the
    // next due date out.
    appData.settings.lastAllowanceDate = due[due.length - 1].toISOString();
}

run();
