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

const allowanceLogic = { calculateAge, distributeAllowance, nextRotationWeek, previousRotationWeek };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = allowanceLogic;
} else {
    window.allowanceLogic = allowanceLogic;
}
