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

        if (!shouldApplyAllowance(appData)) {
            console.log('Allowance already applied recently -- nothing to do.');
            return;
        }

        applyAllowanceToAppData(appData);

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
            console.log(`Weekly allowance applied for ${appData.kids.length} kid(s).`);
            return;
        }

        console.log(`Version conflict on attempt ${attempt} (a device saved in between) -- retrying.`);
    }

    console.error('Could not apply allowance after retries due to repeated version conflicts.');
    process.exit(1);
}

// This job's own cron schedule pins the day/time allowance goes out, so it
// only needs the "not too soon" guard -- mirrors the day-since check in
// app.js's checkAndAddWeeklyAllowance().
function shouldApplyAllowance(appData) {
    if (!appData.settings.lastAllowanceDate) return true;
    const daysSince = (Date.now() - new Date(appData.settings.lastAllowanceDate).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= 6.5; // small buffer under 7 for scheduling jitter
}

function applyAllowanceToAppData(appData) {
    appData.kids.forEach(kid => {
        const age = allowanceLogic.calculateAge(kid.birthday);
        const distribution = allowanceLogic.distributeAllowance(age, appData.settings.rotationWeek);

        kid.balances.save += distribution.save;
        kid.balances.spend += distribution.spend;
        kid.balances.share += distribution.share;

        appData.transactions.unshift({
            id: Date.now() + kid.id,
            date: new Date().toISOString(),
            kidId: kid.id,
            kidName: kid.name,
            bucket: 'all',
            amount: age,
            description: 'Weekly allowance',
            type: 'allowance'
        });
    });

    appData.settings.rotationWeek = allowanceLogic.nextRotationWeek(appData.settings.rotationWeek);
    appData.settings.lastAllowanceDate = new Date().toISOString();
}

run();
