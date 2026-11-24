// Applies any due weekly allowance to an appData object. Uses the shared
// allowance-logic.js so the cron route and the browser can never disagree.
const allowanceLogic = require('../allowance-logic.js');

function dueDates(appData, now = new Date()) {
    if (!appData.settings.lastAllowanceDate) return [];
    const allowanceDay = appData.settings.allowanceDay || 'sunday';
    return allowanceLogic.scheduledAllowancesBetween(
        new Date(appData.settings.lastAllowanceDate), now, allowanceDay);
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

module.exports = { dueDates, applyAllowanceToAppData };
