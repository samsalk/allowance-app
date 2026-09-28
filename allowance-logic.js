// Pure allowance math, with no DOM/browser dependencies, so this file can be
// loaded unmodified both by the browser app (as a plain <script> tag) and by
// the weekly-allowance scheduled job (as a Node script), keeping the rules in
// exactly one place.
//
// Weekly allowance = $1 per year of age, split into a base amount per bucket
// (save/spend/share) plus a remainder distributed round-robin based on a
// rotating week counter (1-3), so the "extra dollar(s)" land on a different
// bucket each time allowance runs.

function calculateAge(birthday) {
    const today = new Date();
    const birthDate = new Date(birthday);
    let age = today.getFullYear() - birthDate.getFullYear();

    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }

    return age;
}

// Distribution for a single week's allowance, given the rotation week (1-3)
// in effect for that week.
function distributeAllowance(age, rotationWeek) {
    const baseAmount = Math.floor(age / 3);
    const remainder = age % 3;

    const distribution = { save: baseAmount, spend: baseAmount, share: baseAmount };

    if (remainder > 0) {
        const buckets = ['save', 'spend', 'share'];
        const rotationIndex = (rotationWeek - 1) % 3;

        for (let i = 0; i < remainder; i++) {
            const bucketIndex = (rotationIndex + i) % 3;
            distribution[buckets[bucketIndex]] += 1;
        }
    }

    return distribution;
}

// Rotation week advances 1 -> 2 -> 3 -> 1 each time allowance is applied.
function nextRotationWeek(rotationWeek) {
    return (rotationWeek % 3) + 1;
}

// Inverse of nextRotationWeek, used to reverse the rotation when undoing
// the most recently applied allowance.
function previousRotationWeek(rotationWeek) {
    return rotationWeek === 1 ? 3 : rotationWeek - 1;
}

// Allowance is "due" at a fixed weekly instant: the configured allowance day at
// ALLOWANCE_HOUR_UTC. Keep the hour in sync with the cron in
// .github/workflows/weekly-allowance.yml. lastAllowanceDate is stamped with the
// due instant that was paid (not the moment the code ran), so a late or manual
// run can never push the next due date out and cause a week to be skipped.
const ALLOWANCE_HOUR_UTC = 14;
const DAY_INDEX = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

// First due instant strictly after `after`.
function nextScheduledAllowance(after, allowanceDay) {
    const target = DAY_INDEX[allowanceDay] ?? 0;
    const from = new Date(after);
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), ALLOWANCE_HOUR_UTC));
    while (d.getUTCDay() !== target || d <= from) {
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return d;
}

// Every due instant in (lastAllowanceDate, now], oldest first.
function scheduledAllowancesBetween(lastAllowanceDate, now, allowanceDay) {
    const due = [];
    let next = nextScheduledAllowance(lastAllowanceDate, allowanceDay);
    while (next <= now) {
        due.push(next);
        next = new Date(next.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    return due;
}

const allowanceLogic = {
    calculateAge, distributeAllowance, nextRotationWeek, previousRotationWeek,
    nextScheduledAllowance, scheduledAllowancesBetween
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = allowanceLogic;
} else {
    window.allowanceLogic = allowanceLogic;
}
