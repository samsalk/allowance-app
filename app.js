// Salkinomics - Family Allowance Tracker
// Main JavaScript functionality

// Global state
let appData = {
    kids: [],
    settings: {
        allowanceDay: 'sunday',
        lastAllowanceDate: null,
        rotationWeek: 1
    },
    transactions: []
};

let currentSetupStep = 1;
let currentGoalKidId = null; // For goal celebration modal
let editingGoalKidId = null; // Kid whose card currently shows the inline goal-edit form
let currentView = 'kids'; // 'kids' or 'parent'
let missedWeeksData = null; // For catch-up functionality
let currentEditKidId = null; // For kid profile editing

// Initialize app: auth.js's initAuthGate() checks for a session, shows the
// login screen if needed, and calls loadData()/initializeApp() once signed in.
document.addEventListener('DOMContentLoaded', function() {
    initAuthGate();
});

// version of the family_data row as last fetched, used for the
// optimistic-concurrency check in saveData().
let dataVersion = null;

// Load data from Supabase into the in-memory appData object that the rest
// of the app reads/mutates exactly like it always has.
async function loadData() {
    try {
        const { data: row, error } = await supabaseClient
            .from('family_data')
            .select('data, version')
            .eq('id', 1)
            .single();

        if (error) throw error;

        appData = row.data;
        dataVersion = row.version;

        // Read-only local cache for instant paint / offline viewing only --
        // never treated as the source of truth on load.
        localStorage.setItem('saveSpendShareData_cache', JSON.stringify(appData));

        console.log('Data loaded successfully from Supabase');

        // Migrate existing data to birthday-only system
        await migrateToCalculatedAges();

        if (appData.kids.length === 0) {
            showWelcomeScreen();
        } else {
            showMainDashboard();
        }
    } catch (error) {
        console.error('Failed to load data:', error);
        alert('Unable to load your data. Please check your connection and reload the page.');
    }
}

// Migrate existing data to use calculated ages
async function migrateToCalculatedAges() {
    let needsMigration = false;

    appData.kids.forEach(kid => {
        if (kid.birthday) {
            const calculatedAge = allowanceLogic.calculateAge(kid.birthday);
            if (kid.age !== calculatedAge) {
                console.log(`Updating ${kid.name}'s age from ${kid.age} to ${calculatedAge} based on birthday`);
                kid.age = calculatedAge;
                needsMigration = true;
            }
        }
    });

    if (needsMigration) {
        await saveData();
    }
}

// Save appData to Supabase, using the row's version as an optimistic
// concurrency check: if another device saved since we last loaded, this
// update matches zero rows instead of silently overwriting their change.
async function saveData() {
    try {
        const { data: rows, error } = await supabaseClient
            .from('family_data')
            .update({
                data: appData,
                version: dataVersion + 1,
                updated_at: new Date().toISOString()
            })
            .eq('id', 1)
            .eq('version', dataVersion)
            .select();

        if (error) throw error;

        if (!rows || rows.length === 0) {
            alert('Someone else just saved a change on another device. Reloading the latest data -- please redo your last action.');
            await loadData();
            return false;
        }

        dataVersion += 1;
        localStorage.setItem('saveSpendShareData_cache', JSON.stringify(appData));
        console.log('Data saved successfully at', new Date().toISOString());
        return true;
    } catch (error) {
        console.error('Failed to save data:', error);
        alert('Unable to save your changes. Please check your connection and try again.');
        return false;
    }
}

// Disables the triggering button and swaps its label while an async action
// runs -- every mutating action is now a real network round-trip (Supabase),
// not instant localStorage, so buttons need to show that something's happening.
async function withLoading(btn, loadingLabel, fn) {
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = loadingLabel;
    try {
        await fn();
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// Initialize the app based on current state
async function initializeApp() {
    // Check if we need to add weekly allowance
    await checkAndAddWeeklyAllowance();
    // Check for birthdays and update ages
    await checkBirthdays();
}

// Show welcome screen
function showWelcomeScreen() {
    document.getElementById('welcome-screen').classList.remove('hidden');
    document.getElementById('setup-wizard').classList.add('hidden');
    document.getElementById('main-navigation').classList.add('hidden');
    document.getElementById('kids-dashboard-view').classList.add('hidden');
    document.getElementById('parent-dashboard-view').classList.add('hidden');
}

// Start setup process
function startSetup() {
    document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('setup-wizard').classList.remove('hidden');
    currentSetupStep = 1;
    showSetupStep(1);
}

// Show specific setup step
function showSetupStep(step) {
    // Hide all steps
    document.querySelectorAll('.setup-step').forEach(el => el.classList.add('hidden'));
    
    // Show current step
    document.getElementById(`setup-step-${step}`).classList.remove('hidden');
    currentSetupStep = step;
}

// Navigate to next setup step
function nextSetupStep() {
    if (currentSetupStep === 1) {
        if (validateKidsInfo()) {
            generateBalancesStep();
            showSetupStep(2);
        }
    } else if (currentSetupStep === 2) {
        generateGoalsStep();
        showSetupStep(3);
    }
}

// Navigate to previous setup step
function prevSetupStep() {
    if (currentSetupStep > 1) {
        showSetupStep(currentSetupStep - 1);
    }
}

// Add a new kid setup card during initial setup
function addKidSetup() {
    const container = document.getElementById('kids-container');
    const kidCount = container.querySelectorAll('.kid-setup').length;
    const newIndex = kidCount;
    
    const kidHtml = `
        <div class="kid-setup kid-manage-card" data-kid-index="${newIndex}" style="margin-bottom: 14px;">
            <div class="kid-manage-head">
                <h4 class="kid-name" style="font-size: 16px;">Child ${newIndex + 1}</h4>
                <button onclick="removeKidSetup(${newIndex})" class="link-btn danger" title="Remove this child">Remove</button>
            </div>
            <div class="field-grid cols-2">
                <div class="field">
                    <label>Name</label>
                    <input type="text" class="kid-name-input" placeholder="Enter name">
                </div>
                <div class="field">
                    <label>Birthday</label>
                    <input type="date" class="kid-birthday">
                </div>
            </div>
            <div class="kid-meta current-age-display">Age will be calculated from birthday</div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', kidHtml);
}

// Remove a kid setup card during initial setup
function removeKidSetup(index) {
    const container = document.getElementById('kids-container');
    const kidCards = container.querySelectorAll('.kid-setup');
    
    // Prevent removing the last kid
    if (kidCards.length <= 1) {
        alert('You must have at least one child.');
        return;
    }
    
    // Find and remove the card with the matching data-kid-index
    const cardToRemove = container.querySelector(`[data-kid-index="${index}"]`);
    if (cardToRemove) {
        cardToRemove.remove();
        
        // Reindex remaining cards
        const remainingCards = container.querySelectorAll('.kid-setup');
        remainingCards.forEach((card, newIndex) => {
            card.setAttribute('data-kid-index', newIndex);
            const title = card.querySelector('h4');
            title.textContent = `Child ${newIndex + 1}`;
            const removeBtn = card.querySelector('button[onclick^="removeKidSetup"]');
            removeBtn.setAttribute('onclick', `removeKidSetup(${newIndex})`);
        });
    }
}

// Validate kids information
function validateKidsInfo() {
    const kidSetups = document.querySelectorAll('.kid-setup');
    let valid = true;
    
    // Check that at least one kid exists
    if (kidSetups.length === 0) {
        alert('Please add at least one child.');
        return false;
    }
    
    kidSetups.forEach((setup, index) => {
        const name = setup.querySelector('.kid-name-input').value.trim();
        const birthday = setup.querySelector('.kid-birthday').value;
        
        if (!name || !birthday) {
            valid = false;
        } else {
            // Calculate and display age
            const age = calculateAge(birthday);
            const ageDisplay = setup.querySelector('.current-age-display');
            ageDisplay.textContent = `Current age: ${age} years old (Weekly allowance: $${age}.00)`;
        }
    });
    
    if (!valid) {
        alert('Please fill in name and birthday for all kids.');
        return false;
    }
    
    return true;
}

// Generate balances step based on kids info
function generateBalancesStep() {
    const kidSetups = document.querySelectorAll('.kid-setup');
    const balancesContainer = document.getElementById('balances-container');
    
    balancesContainer.innerHTML = '';
    
    kidSetups.forEach((setup, index) => {
        const name = setup.querySelector('.kid-name-input').value.trim();
        const birthday = setup.querySelector('.kid-birthday').value;
        
        if (name && birthday) {
            const age = calculateAge(birthday);
            const balanceHtml = `
                <div class="kid-balances kid-manage-card" data-kid-index="${index}" style="margin-bottom: 14px;">
                    <h4 class="kid-name" style="font-size: 16px; margin: 0 0 10px;">${name} (Age ${age}) &mdash; $${age}.00 / week</h4>
                    <div class="field-grid cols-3">
                        <div class="field">
                            <label style="color: var(--save);">Save Balance</label>
                            <input type="number" class="balance-save" step="0.01" min="0" inputmode="decimal" placeholder="0.00">
                        </div>
                        <div class="field">
                            <label style="color: var(--spend);">Spend Balance</label>
                            <input type="number" class="balance-spend" step="0.01" min="0" inputmode="decimal" placeholder="0.00">
                        </div>
                        <div class="field">
                            <label style="color: var(--share);">Share Balance</label>
                            <input type="number" class="balance-share" step="0.01" min="0" inputmode="decimal" placeholder="0.00">
                        </div>
                    </div>
                </div>
            `;
            balancesContainer.innerHTML += balanceHtml;
        }
    });
}

// Generate goals step
function generateGoalsStep() {
    const kidSetups = document.querySelectorAll('.kid-setup');
    const goalsContainer = document.getElementById('goals-container');
    
    goalsContainer.innerHTML = '';
    
    kidSetups.forEach((setup, index) => {
        const name = setup.querySelector('.kid-name-input').value.trim();
        
        if (name) {
            const goalHtml = `
                <div class="kid-goal kid-manage-card" data-kid-index="${index}" style="margin-bottom: 14px;">
                    <h4 class="kid-name" style="font-size: 16px; margin: 0 0 10px;">${name}'s Savings Goal (Optional)</h4>
                    <div class="field-grid cols-2">
                        <div class="field">
                            <label>Goal Name</label>
                            <input type="text" class="goal-name-input" placeholder="e.g., New Bike, Art Set">
                        </div>
                        <div class="field">
                            <label>Target Amount</label>
                            <input type="number" class="goal-target" step="0.01" min="0" inputmode="decimal" placeholder="0.00">
                        </div>
                    </div>
                </div>
            `;
            goalsContainer.innerHTML += goalHtml;
        }
    });
}

// Complete setup and save data
async function completeSetup() {
    const kidSetups = document.querySelectorAll('.kid-setup');
    const balanceSetups = document.querySelectorAll('.kid-balances');
    const goalSetups = document.querySelectorAll('.kid-goal');
    
    appData.kids = [];
    
    kidSetups.forEach((setup, index) => {
        const name = setup.querySelector('.kid-name-input').value.trim();
        const birthday = setup.querySelector('.kid-birthday').value;
        
        if (name && birthday) {
            const age = calculateAge(birthday);
            const balanceSetup = balanceSetups[index];
            const goalSetup = goalSetups[index];
            
            const kid = {
                id: Date.now() + index,
                name: name,
                birthday: birthday,
                balances: {
                    save: parseFloat(balanceSetup.querySelector('.balance-save').value) || 0,
                    spend: parseFloat(balanceSetup.querySelector('.balance-spend').value) || 0,
                    share: parseFloat(balanceSetup.querySelector('.balance-share').value) || 0
                }
            };
            
            // Add goal if provided
            const goalName = goalSetup.querySelector('.goal-name-input').value.trim();
            const goalTarget = parseFloat(goalSetup.querySelector('.goal-target').value);
            
            if (goalName && goalTarget > 0) {
                kid.goal = {
                    name: goalName,
                    target: goalTarget
                };
            }
            
            appData.kids.push(kid);
        }
    });
    
    // Initialize settings
    appData.settings.lastAllowanceDate = null;
    appData.settings.rotationWeek = 1;

    await saveData();
    showMainDashboard();
}

// Show main dashboard
function showMainDashboard() {
    document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('setup-wizard').classList.add('hidden');
    document.getElementById('main-navigation').classList.remove('hidden');
    
    // Check for catch-up needed
    checkForCatchUp();
    
    // Show kids dashboard by default
    showKidsDashboard();
}

// Navigation functions
function showKidsDashboard() {
    currentView = 'kids';

    // Update navigation tabs
    document.getElementById('nav-kids').classList.add('active');
    document.getElementById('nav-parent').classList.remove('active');

    // Show/hide dashboard views
    document.getElementById('kids-dashboard-view').classList.remove('hidden');
    document.getElementById('parent-dashboard-view').classList.add('hidden');
    
    // Render content
    renderNextAllowanceCard();
    renderKidsBalanceCards();
    renderKidsRecentTransactions();
}

// Calculate age from birthday
function calculateAge(birthday) {
    const today = new Date();
    const birthDate = new Date(birthday);
    let age = today.getFullYear() - birthDate.getFullYear();
    
    // Adjust if birthday hasn't occurred this year
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    return age;
}

// Render parent controls
function renderParentControls() {
    const select = document.getElementById('transaction-kid');
    select.innerHTML = '';
    
    appData.kids.forEach(kid => {
        const option = document.createElement('option');
        option.value = kid.id;
        option.textContent = kid.name;
        select.appendChild(option);
    });
}

// Add money to a kid's bucket
async function addMoney() {
    const kidId = parseInt(document.getElementById('transaction-kid').value);
    const bucket = document.getElementById('transaction-bucket').value;
    const amount = parseFloat(document.getElementById('transaction-amount').value);
    const description = document.getElementById('transaction-description').value.trim();
    
    if (!kidId || !amount || amount <= 0) {
        alert('Please select a child and enter a valid amount.');
        return;
    }
    
    const kid = appData.kids.find(k => k.id === kidId);
    if (!kid) {
        alert('Child not found.');
        return;
    }
    
    // Add to balance
    kid.balances[bucket] += amount;
    
    // Add transaction record
    const transaction = {
        id: Date.now(),
        date: new Date().toISOString(),
        kidId: kidId,
        kidName: kid.name,
        bucket: bucket,
        amount: amount,
        description: description || 'Money added',
        type: 'manual_addition'
    };
    
    appData.transactions.unshift(transaction);

    // Clear form
    document.getElementById('transaction-amount').value = '';
    document.getElementById('transaction-description').value = '';

    await saveData();

    // Check for goal completion after adding money
    await checkGoalCompletion(kid);

    updateDashboardAfterTransaction();

    alert(`Added: $${amount.toFixed(2)} to ${kid.name}'s ${bucket} bucket.`);
}

// Record spending (renamed from recordTransaction for clarity)
async function recordSpending() {
    const kidId = parseInt(document.getElementById('transaction-kid').value);
    const bucket = document.getElementById('transaction-bucket').value;
    const amount = parseFloat(document.getElementById('transaction-amount').value);
    const description = document.getElementById('transaction-description').value.trim();
    
    if (!kidId || !amount || amount <= 0) {
        alert('Please select a child and enter a valid amount.');
        return;
    }
    
    const kid = appData.kids.find(k => k.id === kidId);
    if (!kid) {
        alert('Child not found.');
        return;
    }
    
    if (kid.balances[bucket] < amount) {
        alert(`Insufficient balance in ${bucket} bucket. Current balance: $${kid.balances[bucket].toFixed(2)}`);
        return;
    }
    
    // Deduct from balance
    kid.balances[bucket] -= amount;
    
    // Add transaction record
    const transaction = {
        id: Date.now(),
        date: new Date().toISOString(),
        kidId: kidId,
        kidName: kid.name,
        bucket: bucket,
        amount: amount,
        description: description || 'No description',
        type: 'deduction'
    };
    
    appData.transactions.unshift(transaction);

    // Clear form
    document.getElementById('transaction-amount').value = '';
    document.getElementById('transaction-description').value = '';

    await saveData();
    updateDashboardAfterTransaction();

    alert(`Recorded: $${amount.toFixed(2)} deducted from ${kid.name}'s ${bucket} bucket.`);
}

// Check and automatically add weekly allowance
async function checkAndAddWeeklyAllowance() {
    if (!appData.settings.lastAllowanceDate) {
        return; // First time setup, don't auto-add
    }

    const allowanceDay = appData.settings.allowanceDay || 'sunday';
    const due = allowanceLogic.scheduledAllowancesBetween(
        new Date(appData.settings.lastAllowanceDate), new Date(), allowanceDay);

    // Exactly one week due: pay it. More than one is left to the catch-up
    // review so nothing is applied blindly.
    if (due.length === 1) {
        console.log(`Adding weekly allowance due ${due[0].toISOString()}`);
        await addWeeklyAllowance();
    }
}

// Set or edit savings goal
function setGoal(kidId) {
    openGoalManagement(kidId);
}

// Edit existing goal
function editGoal(kidId) {
    openGoalManagement(kidId);
}

// Backup data
function backupData() {
    const dataStr = JSON.stringify(appData, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `save-spend-share-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
}

// Check for goal completion
async function checkGoalCompletion(kid) {
    if (kid.goal && kid.balances.save >= kid.goal.target) {
        await showGoalCelebration(kid);
        return true;
    }
    return false;
}

// Show goal completion celebration
async function showGoalCelebration(kid) {
    const modal = document.getElementById('goal-celebration-modal');
    const message = document.getElementById('goal-celebration-message');
    
    message.textContent = `${kid.name} has reached their savings goal of $${kid.goal.target.toFixed(2)} for "${kid.goal.name}"! 🎉`;
    currentGoalKidId = kid.id;
    
    modal.classList.remove('hidden');
    
    // Add goal completion transaction
    const transaction = {
        id: Date.now(),
        date: new Date().toISOString(),
        kidId: kid.id,
        kidName: kid.name,
        bucket: 'save',
        amount: kid.goal.target,
        description: `Goal completed: ${kid.goal.name}`,
        type: 'goal_completed'
    };
    
    appData.transactions.unshift(transaction);
    await saveData();
}

// Set new goal after completion
function setNewGoal() {
    if (!currentGoalKidId) return;
    
    const kid = appData.kids.find(k => k.id === currentGoalKidId);
    if (!kid) return;
    
    closeGoalCelebration();
    openGoalManagement(currentGoalKidId);
}

// Close goal celebration modal
function closeGoalCelebration() {
    document.getElementById('goal-celebration-modal').classList.add('hidden');
    currentGoalKidId = null;
}

// Check birthdays and update ages
async function checkBirthdays() {
    const today = new Date();
    let birthdayUpdates = false;
    
    appData.kids.forEach(kid => {
        const birthday = new Date(kid.birthday);
        const thisYearBirthday = new Date(today.getFullYear(), birthday.getMonth(), birthday.getDate());
        
        // Check if birthday has passed this year and we haven't updated age yet
        if (today >= thisYearBirthday) {
            const newAge = today.getFullYear() - birthday.getFullYear();
            if (newAge > kid.age) {
                kid.age = newAge;
                birthdayUpdates = true;
                
                // Add birthday transaction
                const transaction = {
                    id: Date.now() + kid.id,
                    date: new Date().toISOString(),
                    kidId: kid.id,
                    kidName: kid.name,
                    bucket: 'all',
                    amount: 0,
                    description: `Happy Birthday! Now ${newAge} years old. Weekly allowance updated to $${newAge}.00`,
                    type: 'birthday'
                };
                
                appData.transactions.unshift(transaction);
            }
        }
    });
    
    if (birthdayUpdates) {
        await saveData();
        const dashboardVisible = !document.getElementById('main-navigation').classList.contains('hidden');
        if (dashboardVisible) {
            updateDashboardAfterTransaction();
        }
    }
}

// Open the inline goal-edit form within the kid's card
function openGoalManagement(kidId) {
    const kid = appData.kids.find(k => k.id === kidId);
    if (!kid) return;

    editingGoalKidId = kidId;
    renderKidsBalanceCards();
}

// Close the inline goal-edit form
function closeGoalManagement() {
    editingGoalKidId = null;
    renderKidsBalanceCards();
}

// Save goal from the inline form
async function saveGoal() {
    if (!editingGoalKidId) return;

    const kid = appData.kids.find(k => k.id === editingGoalKidId);
    if (!kid) return;

    const goalName = document.getElementById('goal-name-input').value.trim();
    const goalTarget = parseFloat(document.getElementById('goal-target-input').value);

    if (!goalName || !goalTarget || goalTarget <= 0) {
        alert('Please enter a valid goal name and target amount.');
        return;
    }

    kid.goal = {
        name: goalName,
        target: goalTarget
    };

    await saveData();
    closeGoalManagement();
}

// Remove goal
async function removeGoal() {
    if (!editingGoalKidId) return;

    const kid = appData.kids.find(k => k.id === editingGoalKidId);
    if (!kid) return;

    if (confirm(`Are you sure you want to remove ${kid.name}'s savings goal?`)) {
        delete kid.goal;
        await saveData();
        closeGoalManagement();
    }
}

// Show transaction history modal
function showTransactionHistory() {
    const view = document.getElementById('transaction-history-modal');
    const kidFilter = document.getElementById('history-filter-kid');

    // Populate kid filter
    kidFilter.innerHTML = '<option value="">All Kids</option>';
    appData.kids.forEach(kid => {
        const option = document.createElement('option');
        option.value = kid.id;
        option.textContent = kid.name;
        kidFilter.appendChild(option);
    });

    // Add event listeners for filters
    document.getElementById('history-filter-kid').addEventListener('change', filterTransactionHistory);
    document.getElementById('history-filter-bucket').addEventListener('change', filterTransactionHistory);
    document.getElementById('history-filter-type').addEventListener('change', filterTransactionHistory);
    document.getElementById('history-search').addEventListener('input', filterTransactionHistory);

    // Drill-in view: hide the dashboards and nav, show this in their place.
    document.getElementById('kids-dashboard-view').classList.add('hidden');
    document.getElementById('parent-dashboard-view').classList.add('hidden');
    document.getElementById('main-navigation').classList.add('hidden');
    view.classList.remove('hidden');

    filterTransactionHistory(); // Initial load
}

// Close the transaction history view and return to the Parent Dashboard
function closeTransactionHistory() {
    document.getElementById('transaction-history-modal').classList.add('hidden');
    document.getElementById('main-navigation').classList.remove('hidden');
    showParentDashboard();
}

// Filter transaction history
function filterTransactionHistory() {
    const kidFilter = document.getElementById('history-filter-kid').value;
    const bucketFilter = document.getElementById('history-filter-bucket').value;
    const typeFilter = document.getElementById('history-filter-type').value;
    const searchFilter = document.getElementById('history-search').value.toLowerCase();
    
    let filteredTransactions = appData.transactions.filter(transaction => {
        const matchesKid = !kidFilter || transaction.kidId == kidFilter;
        const matchesBucket = !bucketFilter || transaction.bucket === bucketFilter;
        const matchesType = !typeFilter || transaction.type === typeFilter;
        const matchesSearch = !searchFilter || 
            transaction.description.toLowerCase().includes(searchFilter) ||
            transaction.kidName.toLowerCase().includes(searchFilter);
        
        return matchesKid && matchesBucket && matchesType && matchesSearch;
    });
    
    renderTransactionHistory(filteredTransactions);
}

// Render transaction history
function renderTransactionHistory(transactions) {
    const container = document.getElementById('transaction-history-list');
    const countElement = document.getElementById('transaction-count');

    countElement.textContent = `Showing ${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}`;

    if (transactions.length === 0) {
        container.innerHTML = '<p class="empty-note">No transactions match your filters.</p>';
        return;
    }

    container.innerHTML = transactions.map(t => activityStubHtml(t, { showTime: true })).join('');
}

// Export transactions to CSV
function exportTransactions() {
    const kidFilter = document.getElementById('history-filter-kid').value;
    const bucketFilter = document.getElementById('history-filter-bucket').value;
    const typeFilter = document.getElementById('history-filter-type').value;
    const searchFilter = document.getElementById('history-search').value.toLowerCase();
    
    let filteredTransactions = appData.transactions.filter(transaction => {
        const matchesKid = !kidFilter || transaction.kidId == kidFilter;
        const matchesBucket = !bucketFilter || transaction.bucket === bucketFilter;
        const matchesType = !typeFilter || transaction.type === typeFilter;
        const matchesSearch = !searchFilter || 
            transaction.description.toLowerCase().includes(searchFilter) ||
            transaction.kidName.toLowerCase().includes(searchFilter);
        
        return matchesKid && matchesBucket && matchesType && matchesSearch;
    });
    
    if (filteredTransactions.length === 0) {
        alert('No transactions to export.');
        return;
    }
    
    // Create CSV content
    const headers = ['Date', 'Time', 'Child', 'Bucket', 'Type', 'Amount', 'Description'];
    const csvContent = [
        headers.join(','),
        ...filteredTransactions.map(transaction => {
            const date = new Date(transaction.date);
            return [
                date.toLocaleDateString(),
                date.toLocaleTimeString(),
                `"${transaction.kidName}"`,
                transaction.bucket,
                transaction.type,
                transaction.amount.toFixed(2),
                `"${transaction.description}"`
            ].join(',');
        })
    ].join('\n');
    
    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

// Helper function to get week date range string
function getWeekDateRange(date) {
    const startOfWeek = new Date(date);
    const endOfWeek = new Date(date);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    
    const options = { month: 'short', day: 'numeric' };
    const startStr = startOfWeek.toLocaleDateString('en-US', options);
    const endStr = endOfWeek.toLocaleDateString('en-US', options);
    const year = startOfWeek.getFullYear();
    
    return `${startStr} - ${endStr}, ${year}`;
}

// Helper function to calculate specific missed weeks
function calculateMissedWeeks(lastAllowanceDate, currentDate) {
    const allowanceDay = appData.settings.allowanceDay || 'sunday';
    return allowanceLogic.scheduledAllowancesBetween(new Date(lastAllowanceDate), new Date(currentDate), allowanceDay)
        .map(dueDate => ({
            dueDate,
            weekStart: dueDate,
            weekEnd: new Date(dueDate.getTime() + 6 * 24 * 60 * 60 * 1000),
            dateRange: getWeekDateRange(dueDate)
        }));
}

// Check for catch-up needed
function checkForCatchUp() {
    if (!appData.settings.lastAllowanceDate) {
        return; // First time setup, don't show catch-up
    }
    
    const lastDate = new Date(appData.settings.lastAllowanceDate);
    const now = new Date();
    const specificMissedWeeks = calculateMissedWeeks(lastDate, now);
    
    if (specificMissedWeeks.length > 0) {
        missedWeeksData = {
            lastDate: lastDate,
            currentDate: now,
            missedWeeks: specificMissedWeeks.length,
            daysSince: Math.floor((now - lastDate) / (1000 * 60 * 60 * 24)),
            specificWeeks: specificMissedWeeks
        };
        
        showCatchUpAlert();
    }
}

// Show catch-up alert
function showCatchUpAlert() {
    const alert = document.getElementById('catchup-alert');
    const message = document.getElementById('catchup-message');
    
    message.textContent = `It's been ${missedWeeksData.missedWeeks} week${missedWeeksData.missedWeeks > 1 ? 's' : ''} since your last allowance.`;
    alert.classList.remove('hidden');
}

// Dismiss catch-up alert
function dismissCatchupAlert() {
    document.getElementById('catchup-alert').classList.add('hidden');
    missedWeeksData = null;
}

// Show catch-up review modal
function showCatchupReview() {
    if (!missedWeeksData) return;
    
    const modal = document.getElementById('catchup-review-modal');
    const lastDateElement = document.getElementById('last-allowance-date');
    const currentDateElement = document.getElementById('current-date');
    const missedWeeksElement = document.getElementById('missed-weeks-count');
    const kidsContainer = document.getElementById('catchup-kids-container');
    
    lastDateElement.textContent = missedWeeksData.lastDate.toLocaleDateString();
    currentDateElement.textContent = missedWeeksData.currentDate.toLocaleDateString();
    missedWeeksElement.textContent = missedWeeksData.missedWeeks;
    
    // Generate detailed week breakdown and kid selection controls
    kidsContainer.innerHTML = '';

    // First, show the specific missed weeks
    const missedWeeksHtml = `
        <div class="notice">
            <h3 style="margin-bottom: 8px;">Missed Weeks</h3>
            ${missedWeeksData.specificWeeks.map((week, index) => `
                <div class="info-row">
                    <span>Week ${index + 1}: ${week.dateRange}</span>
                    <span class="val">$${appData.kids.reduce((sum, kid) => sum + kid.age, 0).toFixed(2)}</span>
                </div>
            `).join('')}
        </div>
    `;
    kidsContainer.innerHTML += missedWeeksHtml;

    // Then show kid selection controls
    appData.kids.forEach(kid => {
        const weeklyAmount = kid.age;
        const totalAmount = weeklyAmount * missedWeeksData.missedWeeks;

        const kidHtml = `
            <div class="kid-manage-card" style="margin-bottom: 12px;">
                <div class="kid-manage-head">
                    <span class="kid-name" style="font-size: 16px;">${kid.name} (Age ${kid.age})</span>
                    <span class="kid-meta">$${weeklyAmount}.00 / week</span>
                </div>
                <div class="field">
                    <label for="catchup-weeks-${kid.id}">Weeks to add (Total: $<span id="catchup-total-${kid.id}">${totalAmount.toFixed(2)}</span>)</label>
                    <select id="catchup-weeks-${kid.id}">
                        ${Array.from({length: missedWeeksData.missedWeeks + 1}, (_, i) =>
                            `<option value="${i}" ${i === missedWeeksData.missedWeeks ? 'selected' : ''}>${i}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="stub-sub catchup-week-preview">
                    Will add allowances for: ${missedWeeksData.specificWeeks.slice(0, missedWeeksData.missedWeeks).map(w => w.dateRange).join(', ')}
                </div>
            </div>
        `;
        kidsContainer.innerHTML += kidHtml;

        // Add event listener to update total and week preview
        document.getElementById(`catchup-weeks-${kid.id}`).addEventListener('change', function() {
            const weeks = parseInt(this.value);
            const total = weeklyAmount * weeks;
            document.getElementById(`catchup-total-${kid.id}`).textContent = total.toFixed(2);

            // Update week preview
            const previewElement = this.closest('.kid-manage-card').querySelector('.catchup-week-preview');
            if (weeks === 0) {
                previewElement.textContent = 'No weeks selected';
            } else {
                const selectedWeeks = missedWeeksData.specificWeeks.slice(0, weeks).map(w => w.dateRange).join(', ');
                previewElement.textContent = `Will add allowances for: ${selectedWeeks}`;
            }
        });
    });

    modal.classList.remove('hidden');
}

// Close catch-up review modal
function closeCatchupReview() {
    document.getElementById('catchup-review-modal').classList.add('hidden');
}

// Add all missed allowances automatically
async function addAllMissedAllowances() {
    if (!missedWeeksData) return;

    const weeksToAdd = missedWeeksData.missedWeeks;
    await addMissedAllowancesForWeeks(weeksToAdd);

    dismissCatchupAlert();
    alert(`Added ${weeksToAdd} week${weeksToAdd > 1 ? 's' : ''} of allowances for all kids!`);
}

// Add selected allowances from review modal
async function addSelectedAllowances() {
    if (!missedWeeksData) return;

    let totalAdded = 0;
    appData.kids.forEach(kid => {
        const weeksSelect = document.getElementById(`catchup-weeks-${kid.id}`);
        const weeksToAdd = parseInt(weeksSelect.value);

        if (weeksToAdd > 0) {
            addMissedAllowancesForKid(kid, weeksToAdd);
            totalAdded += weeksToAdd;
        }
    });

    // Stamp the last due instant covered, not "now"
    appData.settings.lastAllowanceDate = missedWeeksData.specificWeeks[missedWeeksData.specificWeeks.length - 1].dueDate.toISOString();
    await saveData();

    // Check for goal completions
    for (const kid of appData.kids) {
        await checkGoalCompletion(kid);
    }

    // Refresh current view
    if (currentView === 'kids') {
        renderKidsBalanceCards();
        renderKidsRecentTransactions();
    } else {
        renderFamilySummary();
        renderParentRecentTransactions();
    }

    closeCatchupReview();
    dismissCatchupAlert();

    if (totalAdded > 0) {
        alert(`Added selected allowances successfully!`);
    }
}

// Add missed allowances for a specific kid. Pure in-memory mutation --
// callers are responsible for saveData() once all kids are processed.
function addMissedAllowancesForKid(kid, weeksToAdd) {
    const processingDate = new Date(); // Actual date when catch-up is processed
    const age = allowanceLogic.calculateAge(kid.birthday);

    for (let week = 0; week < weeksToAdd; week++) {
        const distribution = allowanceLogic.distributeAllowance(age, appData.settings.rotationWeek + week);

        kid.balances.save += distribution.save;
        kid.balances.spend += distribution.spend;
        kid.balances.share += distribution.share;

        // Get the specific week information for description
        const specificWeek = missedWeeksData.specificWeeks[week];
        const weekRange = specificWeek ? specificWeek.dateRange : getWeekDateRange(new Date(missedWeeksData.lastDate.getTime() + (week + 1) * 7 * 24 * 60 * 60 * 1000));

        const transaction = {
            id: Date.now() + kid.id + week,
            date: processingDate.toISOString(), // Use actual processing date
            kidId: kid.id,
            kidName: kid.name,
            bucket: 'all',
            amount: age,
            description: `Weekly allowance for ${weekRange} (catch-up)`, // Clear catch-up indicator
            type: 'allowance'
        };

        appData.transactions.unshift(transaction);
    }

    // Update rotation week
    appData.settings.rotationWeek = ((appData.settings.rotationWeek - 1 + weeksToAdd) % 3) + 1;
}

// Add missed allowances for all kids for specified weeks
async function addMissedAllowancesForWeeks(weeksToAdd) {
    appData.kids.forEach(kid => {
        addMissedAllowancesForKid(kid, weeksToAdd);
    });

    // Stamp the last due instant covered, not "now"
    appData.settings.lastAllowanceDate = missedWeeksData.specificWeeks[missedWeeksData.specificWeeks.length - 1].dueDate.toISOString();
    await saveData();

    // Check for goal completions
    for (const kid of appData.kids) {
        await checkGoalCompletion(kid);
    }

    // Refresh current view
    if (currentView === 'kids') {
        renderKidsBalanceCards();
        renderKidsRecentTransactions();
    } else {
        renderFamilySummary();
        renderParentRecentTransactions();
    }
}

// Render next allowance card
function renderNextAllowanceCard() {
    const nextSunday = getNextSunday();
    const daysUntil = Math.ceil((nextSunday - new Date()) / (1000 * 60 * 60 * 24));
    
    // Format the date nicely for display
    const dateOptions = { weekday: 'long', month: 'long', day: 'numeric' };
    const formattedDate = nextSunday.toLocaleDateString('en-US', dateOptions);
    
    document.getElementById('next-allowance-date').textContent = formattedDate;
    
    if (daysUntil === 0) {
        document.getElementById('next-allowance-countdown').textContent = 'Today!';
    } else if (daysUntil === 1) {
        document.getElementById('next-allowance-countdown').textContent = 'Tomorrow';
    } else {
        document.getElementById('next-allowance-countdown').textContent = `${daysUntil} days away`;
    }
}

// Get next Sunday
function getNextSunday() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
    
    const nextSunday = new Date(today);
    nextSunday.setDate(today.getDate() + daysUntilSunday);
    return nextSunday;
}

// Calculate next allowance distribution for a kid
function calculateNextAllowanceDistribution(kid) {
    const age = allowanceLogic.calculateAge(kid.birthday);
    return allowanceLogic.distributeAllowance(age, appData.settings.rotationWeek);
}

// Render kids balance cards (updated for new container)
// Small inline-icon glyphs for each bucket, used instead of emoji.
const BUCKET_ICONS = {
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10c0-1 3-3 8-3s8 2 8 3v6c0 1-3 3-8 3s-8-2-8-3z"/><path d="M4 10c0 1 3 3 8 3s8-2 8-3"/></svg>',
    spend: '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h11l2 12H4z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.4-9.3-8.8C1.2 8 2.7 5 6 5c2 0 3.3 1 4 2.2C10.7 6 12 5 14 5c3.3 0 4.8 3 3.3 6.2C15 15.6 12 20 12 20z"/></svg>',
    all: '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
};

function bucketRowHtml(bucket, label, amount) {
    return `
        <div class="bucket ${bucket}-bucket">
            <div class="bucket-icon">${BUCKET_ICONS[bucket]}</div>
            <div class="bucket-label">${label}</div>
            <div class="bucket-amount">$${amount.toFixed(2)}</div>
        </div>
    `;
}

function renderKidsBalanceCards() {
    const container = document.getElementById('kids-balance-cards');
    if (!container) return; // Exit if the element doesn't exist (different view)
    container.innerHTML = '';

    appData.kids.forEach(kid => {
        const totalBalance = kid.balances.save + kid.balances.spend + kid.balances.share;
        const initial = kid.name.charAt(0).toUpperCase();
        const nextAllowance = calculateNextAllowanceDistribution(kid);

        let goalHtml = '';
        if (kid.id === editingGoalKidId) {
            goalHtml = `
                <div class="inline-expand">
                    <div class="field">
                        <label for="goal-name-input">Goal Name</label>
                        <input type="text" id="goal-name-input" placeholder="e.g., New Bike, Art Set" value="${kid.goal ? kid.goal.name : ''}">
                    </div>
                    <div class="field">
                        <label for="goal-target-input">Target Amount</label>
                        <input type="number" id="goal-target-input" step="0.01" min="0" placeholder="0.00" value="${kid.goal ? kid.goal.target : ''}">
                    </div>
                    <div class="btn-row">
                        <button onclick="withLoading(this, 'Saving…', saveGoal)" class="btn btn-solid">Save</button>
                        ${kid.goal ? '<button onclick="withLoading(this, \'Removing…\', removeGoal)" class="btn btn-spend">Remove</button>' : ''}
                        <button onclick="closeGoalManagement()" class="btn btn-neutral">Cancel</button>
                    </div>
                </div>
            `;
        } else if (kid.goal) {
            const progress = Math.min((kid.balances.save / kid.goal.target) * 100, 100);
            const remaining = Math.max(kid.goal.target - kid.balances.save, 0);

            goalHtml = `
                <div class="goal">
                    <div class="goal-row">
                        <button onclick="editGoal(${kid.id})" class="goal-name-link goal-name">${kid.goal.name}</button>
                        <span class="goal-pct">${progress.toFixed(0)}%</span>
                    </div>
                    <div class="goal-track"><div class="goal-fill" style="width: ${progress}%;"></div></div>
                    <div class="goal-caption">
                        <span>$${kid.balances.save.toFixed(2)} saved</span>
                        <span>$${remaining.toFixed(2)} to go</span>
                    </div>
                </div>
            `;
        } else {
            goalHtml = `
                <div class="goal-cta">
                    <button onclick="setGoal(${kid.id})" class="btn btn-outline">+ Set a Savings Goal</button>
                </div>
            `;
        }

        const cardHtml = `
            <div class="card kid-card">
                <div class="kid-head">
                    <div class="kid-stamp">${initial}</div>
                    <div>
                        <p class="kid-name">${kid.name}</p>
                        <div class="kid-meta">Age ${kid.age} &middot; $${kid.age}.00 / week</div>
                        <div class="kid-meta">Next: +$${nextAllowance.save} Save, +$${nextAllowance.spend} Spend, +$${nextAllowance.share} Share</div>
                    </div>
                </div>
                <div class="buckets">
                    ${bucketRowHtml('save', 'Save', kid.balances.save)}
                    ${bucketRowHtml('spend', 'Spend', kid.balances.spend)}
                    ${bucketRowHtml('share', 'Share', kid.balances.share)}
                </div>
                <div class="kid-total"><span>Total</span><span class="amt">$${totalBalance.toFixed(2)}</span></div>
                ${goalHtml}
            </div>
        `;

        container.innerHTML += cardHtml;
    });
}

// Render kids recent transactions
// Shared "ticket stub" row for a single transaction, used by both the kids
// and parent activity lists.
function activityStubHtml(transaction, { showTime = false } = {}) {
    const dateObj = new Date(transaction.date);
    const dateLabel = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    let tone = 'save-tone';
    let iconBg = 'save-bucket';
    let icon = BUCKET_ICONS.all;
    let amountPrefix = '+';

    if (transaction.type === 'deduction') {
        tone = 'spend-tone';
        iconBg = 'spend-bucket';
        icon = BUCKET_ICONS.spend;
        amountPrefix = '−';
    } else if (['save', 'spend', 'share'].includes(transaction.bucket)) {
        tone = `${transaction.bucket}-tone`;
        iconBg = `${transaction.bucket}-bucket`;
        icon = BUCKET_ICONS[transaction.bucket];
    }

    const typeLabels = {
        allowance: 'Allowance',
        goal_completed: 'Goal completed',
        birthday: 'Birthday',
        profile_update: 'Update',
        undo_allowance: 'Undo'
    };
    const label = typeLabels[transaction.type]
        || (transaction.bucket && transaction.bucket !== 'all' ? transaction.bucket.charAt(0).toUpperCase() + transaction.bucket.slice(1) : '');

    const timeStr = showTime ? ` &middot; ${dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : '';
    const amountHtml = transaction.amount > 0 ? `${amountPrefix}$${transaction.amount.toFixed(2)}` : '&mdash;';

    return `
        <div class="stub">
            <div class="stub-icon ${iconBg}">${icon}</div>
            <div class="stub-desc">
                <span class="who">${transaction.kidName}</span> &mdash; ${label}
                <div class="stub-sub">${transaction.description} &middot; ${dateLabel}${timeStr}</div>
            </div>
            <div class="stub-amt ${tone}">${amountHtml}</div>
        </div>
    `;
}

function renderKidsRecentTransactions() {
    const container = document.getElementById('kids-recent-transactions');
    const recentTransactions = appData.transactions.slice(0, 5); // Show fewer for kids view

    if (recentTransactions.length === 0) {
        container.innerHTML = '<p class="empty-note">No activity yet.</p>';
        return;
    }

    container.innerHTML = recentTransactions.map(t => activityStubHtml(t)).join('');
}

// Render family summary for parent dashboard
function renderFamilySummary() {
    const container = document.getElementById('family-summary');
    
    const totalSave = appData.kids.reduce((sum, kid) => sum + kid.balances.save, 0);
    const totalSpend = appData.kids.reduce((sum, kid) => sum + kid.balances.spend, 0);
    const totalShare = appData.kids.reduce((sum, kid) => sum + kid.balances.share, 0);
    const totalBalance = totalSave + totalSpend + totalShare;
    const totalWeeklyAllowance = appData.kids.reduce((sum, kid) => sum + kid.age, 0);
    
    container.innerHTML = `
        <div class="info-row"><span>Total Family Balance</span><span class="val">$${totalBalance.toFixed(2)}</span></div>
        <div class="info-row save-tone"><span>Total Savings</span><span class="val">$${totalSave.toFixed(2)}</span></div>
        <div class="info-row spend-tone"><span>Total Spending</span><span class="val">$${totalSpend.toFixed(2)}</span></div>
        <div class="info-row share-tone"><span>Total Sharing</span><span class="val">$${totalShare.toFixed(2)}</span></div>
        <div class="info-row"><span>Weekly Allowance</span><span class="val">$${totalWeeklyAllowance.toFixed(2)}</span></div>
    `;
}

// Render goals summary for parent dashboard
function renderGoalsSummary() {
    const container = document.getElementById('goals-summary');

    const kidsWithGoals = appData.kids.filter(kid => kid.goal);

    if (kidsWithGoals.length === 0) {
        container.innerHTML = '<p class="empty-note">No active savings goals.</p>';
        return;
    }

    container.innerHTML = kidsWithGoals.map(kid => {
        const progress = Math.min((kid.balances.save / kid.goal.target) * 100, 100);
        const remaining = Math.max(kid.goal.target - kid.balances.save, 0);

        return `
            <div class="goal">
                <div class="goal-row">
                    <span class="goal-name">${kid.name} &mdash; ${kid.goal.name}</span>
                    <span class="goal-pct">${progress.toFixed(0)}%</span>
                </div>
                <div class="goal-track"><div class="goal-fill" style="width: ${progress}%;"></div></div>
                <div class="goal-caption">
                    <span>$${kid.balances.save.toFixed(2)} saved</span>
                    <span>$${remaining.toFixed(2)} to go</span>
                </div>
            </div>
        `;
    }).join('');
}

// Render parent recent transactions (show more)
function renderParentRecentTransactions() {
    const container = document.getElementById('parent-recent-transactions');
    const recentTransactions = appData.transactions.slice(0, 20); // Show more for parent view

    if (recentTransactions.length === 0) {
        container.innerHTML = '<p class="empty-note">No transactions yet.</p>';
        return;
    }

    container.innerHTML = recentTransactions.map(t => activityStubHtml(t, { showTime: true })).join('');
}

// Update existing functions to work with new dashboard structure
function updateDashboardAfterTransaction() {
    if (currentView === 'kids') {
        renderKidsBalanceCards();
        renderKidsRecentTransactions();
    } else {
        renderFamilySummary();
        renderGoalsSummary();
        renderParentRecentTransactions();
    }
}

// Render family management cards
function renderFamilyManagement() {
    const container = document.getElementById('family-management-cards');
    container.innerHTML = '';
    
    container.innerHTML = appData.kids.map(kid => {
        const totalBalance = kid.balances.save + kid.balances.spend + kid.balances.share;
        const birthday = new Date(kid.birthday).toLocaleDateString();

        return `
            <div class="kid-manage-card">
                <div class="kid-manage-head">
                    <p class="kid-name">${kid.name}</p>
                    <div class="kid-manage-actions">
                        <button onclick="editKidProfile(${kid.id})" class="link-btn">Edit</button>
                        <button onclick="withLoading(this, 'Removing…', () => removeKid(${kid.id}))" class="link-btn danger" title="Remove this child">Remove</button>
                    </div>
                </div>
                <div class="info-row"><span>Age</span><span class="val">${kid.age} years old</span></div>
                <div class="info-row"><span>Birthday</span><span class="val">${birthday}</span></div>
                <div class="info-row save-tone"><span>Weekly Allowance</span><span class="val">$${kid.age}.00</span></div>
                <div class="info-row"><span>Total Balance</span><span class="val">$${totalBalance.toFixed(2)}</span></div>
            </div>
        `;
    }).join('');
}

// Open Add Kid Modal
function openAddKidModal() {
    const modal = document.getElementById('add-kid-modal');
    const nameInput = document.getElementById('add-kid-name');
    const birthdayInput = document.getElementById('add-kid-birthday');
    const saveInput = document.getElementById('add-kid-save');
    const spendInput = document.getElementById('add-kid-spend');
    const shareInput = document.getElementById('add-kid-share');
    const allowancePreview = document.getElementById('add-kid-allowance-preview');
    
    // Clear inputs
    nameInput.value = '';
    birthdayInput.value = '';
    saveInput.value = '0';
    spendInput.value = '0';
    shareInput.value = '0';
    allowancePreview.textContent = '$0.00';
    
    // Add event listener to update allowance preview when birthday changes
    birthdayInput.addEventListener('change', function() {
        if (this.value) {
            const age = calculateAge(this.value);
            allowancePreview.textContent = `$${age}.00`;
        } else {
            allowancePreview.textContent = '$0.00';
        }
    });
    
    modal.classList.remove('hidden');
}

// Close Add Kid Modal
function closeAddKidModal() {
    document.getElementById('add-kid-modal').classList.add('hidden');
}

// Save new kid from modal
async function saveNewKid() {
    const name = document.getElementById('add-kid-name').value.trim();
    const birthday = document.getElementById('add-kid-birthday').value;
    const saveBalance = parseFloat(document.getElementById('add-kid-save').value) || 0;
    const spendBalance = parseFloat(document.getElementById('add-kid-spend').value) || 0;
    const shareBalance = parseFloat(document.getElementById('add-kid-share').value) || 0;
    
    if (!name || !birthday) {
        alert('Please enter a name and birthday for the child.');
        return;
    }
    
    const age = calculateAge(birthday);
    
    // Create new kid object
    const newKid = {
        id: Date.now(),
        name: name,
        birthday: birthday,
        age: age,
        balances: {
            save: saveBalance,
            spend: spendBalance,
            share: shareBalance
        }
    };
    
    // Add to appData
    appData.kids.push(newKid);
    
    // Add transaction record for the new kid
    const transaction = {
        id: Date.now(),
        date: new Date().toISOString(),
        kidId: newKid.id,
        kidName: name,
        bucket: 'all',
        amount: saveBalance + spendBalance + shareBalance,
        description: `New child added: ${name} (Age ${age}) with starting balance of $${(saveBalance + spendBalance + shareBalance).toFixed(2)}`,
        type: 'profile_update'
    };
    
    appData.transactions.unshift(transaction);

    await saveData();

    // Update all dashboard views
    renderFamilyManagement();
    renderParentControls(); // Update dropdown options
    renderFamilySummary();
    renderGoalsSummary();
    renderParentRecentTransactions();

    // If currently on kids view, update that too
    if (currentView === 'kids') {
        renderKidsBalanceCards();
        renderKidsRecentTransactions();
        renderNextAllowanceCard();
    }

    closeAddKidModal();

    alert(`${name} has been added to your family!`);
}

// Remove a kid from the family
async function removeKid(kidId) {
    // Prevent removing the last kid
    if (appData.kids.length <= 1) {
        alert('You must have at least one child in the app.');
        return;
    }
    
    const kid = appData.kids.find(k => k.id === kidId);
    if (!kid) return;
    
    const totalBalance = kid.balances.save + kid.balances.spend + kid.balances.share;
    
    let confirmMessage = `Are you sure you want to remove ${kid.name} from your family?`;
    if (totalBalance > 0) {
        confirmMessage += `\n\n⚠️ Warning: ${kid.name} has a balance of $${totalBalance.toFixed(2)} that will be deleted.`;
    }
    confirmMessage += `\n\nThis action cannot be undone.`;
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    // Remove kid from appData
    appData.kids = appData.kids.filter(k => k.id !== kidId);
    
    // Add transaction record for the removal
    const transaction = {
        id: Date.now(),
        date: new Date().toISOString(),
        kidId: 0, // Special ID for system transactions
        kidName: 'System',
        bucket: 'all',
        amount: 0,
        description: `Child removed: ${kid.name} (Balance $${totalBalance.toFixed(2)} deleted)`,
        type: 'profile_update'
    };
    
    appData.transactions.unshift(transaction);

    await saveData();

    // Update all dashboard views
    renderFamilyManagement();
    renderParentControls(); // Update dropdown options
    renderFamilySummary();
    renderGoalsSummary();
    renderParentRecentTransactions();

    // If currently on kids view, update that too
    if (currentView === 'kids') {
        renderKidsBalanceCards();
        renderKidsRecentTransactions();
        renderNextAllowanceCard();
    }

    alert(`${kid.name} has been removed from your family.`);
}

// Edit kid profile
function editKidProfile(kidId) {
    const kid = appData.kids.find(k => k.id === kidId);
    if (!kid) return;
    
    currentEditKidId = kidId;
    
    const modal = document.getElementById('kid-profile-modal');
    const nameInput = document.getElementById('profile-name-input');
    const ageInput = document.getElementById('profile-age-input');
    const birthdayInput = document.getElementById('profile-birthday-input');
    const allowancePreview = document.getElementById('allowance-preview');
    
    // Populate current values
    nameInput.value = kid.name;
    ageInput.value = kid.age;
    birthdayInput.value = kid.birthday;
    allowancePreview.textContent = `$${kid.age}.00`;
    
    // Add event listener to update allowance preview when age changes
    ageInput.addEventListener('input', function() {
        const newAge = parseInt(this.value) || 0;
        allowancePreview.textContent = `$${newAge}.00`;
    });
    
    modal.classList.remove('hidden');
}

// Close kid profile edit modal
function closeKidProfileEdit() {
    document.getElementById('kid-profile-modal').classList.add('hidden');
    currentEditKidId = null;
}

// Save kid profile changes
async function saveKidProfile() {
    if (!currentEditKidId) return;
    
    const kid = appData.kids.find(k => k.id === currentEditKidId);
    if (!kid) return;
    
    const newName = document.getElementById('profile-name-input').value.trim();
    const newAge = parseInt(document.getElementById('profile-age-input').value);
    const newBirthday = document.getElementById('profile-birthday-input').value;
    
    if (!newName || !newAge || !newBirthday || newAge < 1 || newAge > 18) {
        alert('Please enter valid information for all fields.');
        return;
    }
    
    // Validate that birthday and age are consistent
    const birthdayDate = new Date(newBirthday);
    const today = new Date();
    const calculatedAge = today.getFullYear() - birthdayDate.getFullYear();
    const monthDiff = today.getMonth() - birthdayDate.getMonth();
    const dayDiff = today.getDate() - birthdayDate.getDate();
    
    // Adjust age if birthday hasn't occurred this year
    const actualAge = (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) ? calculatedAge - 1 : calculatedAge;
    
    if (Math.abs(newAge - actualAge) > 1) {
        if (!confirm(`The age (${newAge}) and birthday (${birthdayDate.toLocaleDateString()}) don't seem to match. The calculated age would be ${actualAge}. Do you want to continue anyway?`)) {
            return;
        }
    }
    
    // Store old values for transaction record
    const oldName = kid.name;
    const oldAge = kid.age;
    
    // Update kid information
    kid.name = newName;
    kid.age = newAge;
    kid.birthday = newBirthday;
    
    // Add profile update transaction
    const changes = [];
    if (oldName !== newName) changes.push(`Name: ${oldName} → ${newName}`);
    if (oldAge !== newAge) changes.push(`Age: ${oldAge} → ${newAge} (Allowance: $${oldAge}.00 → $${newAge}.00)`);
    
    if (changes.length > 0) {
        const transaction = {
            id: Date.now(),
            date: new Date().toISOString(),
            kidId: kid.id,
            kidName: newName,
            bucket: 'all',
            amount: 0,
            description: `Profile updated: ${changes.join(', ')}`,
            type: 'profile_update'
        };
        
        appData.transactions.unshift(transaction);
    }

    await saveData();

    // Update all dashboard views
    renderFamilyManagement();
    renderParentControls(); // Update dropdown options
    renderFamilySummary();
    renderGoalsSummary();
    renderParentRecentTransactions();

    // If currently on kids view, update that too
    if (currentView === 'kids') {
        renderKidsBalanceCards();
        renderKidsRecentTransactions();
        renderNextAllowanceCard();
    }

    closeKidProfileEdit();

    alert(`${newName}'s profile has been updated successfully!`);
}

// Show allowance confirmation dialog
function confirmAddWeeklyAllowance() {
    const modal = document.getElementById('allowance-confirmation-modal');
    const previewList = document.getElementById('allowance-preview-list');
    
    previewList.innerHTML = '';
    
    appData.kids.forEach(kid => {
        const distribution = calculateNextAllowanceDistribution(kid);
        const total = distribution.save + distribution.spend + distribution.share;

        const previewHtml = `
            <div class="info-row">
                <span>${kid.name} (Age ${kid.age})</span>
                <span class="val">$${total.toFixed(2)}</span>
            </div>
            <div class="stub-sub" style="margin: -6px 0 6px;">+$${distribution.save} Save, +$${distribution.spend} Spend, +$${distribution.share} Share</div>
        `;
        previewList.innerHTML += previewHtml;
    });
    
    modal.classList.remove('hidden');
}

// Close allowance confirmation dialog
function closeAllowanceConfirmation() {
    document.getElementById('allowance-confirmation-modal').classList.add('hidden');
}

// Check if undo is available and update button visibility
function updateUndoButtonVisibility() {
    const undoBtn = document.getElementById('undo-allowance-btn');
    if (!undoBtn) return;
    
    if (canUndoLastAllowance()) {
        undoBtn.classList.remove('hidden');
    } else {
        undoBtn.classList.add('hidden');
    }
}

// Check if we can undo the last allowance
function canUndoLastAllowance() {
    if (appData.transactions.length === 0) return false;
    
    // Find the most recent allowance transactions
    const recentAllowanceTransactions = [];
    for (let i = 0; i < appData.transactions.length; i++) {
        const transaction = appData.transactions[i];
        if (transaction.type === 'allowance' && !transaction.description.includes('catch-up')) {
            recentAllowanceTransactions.push(transaction);
            // If we have transactions for all kids, we found a complete allowance set
            if (recentAllowanceTransactions.length === appData.kids.length) {
                break;
            }
        } else if (transaction.type !== 'allowance') {
            // If we hit a non-allowance transaction before finding all kids, can't undo
            break;
        }
    }
    
    return recentAllowanceTransactions.length === appData.kids.length;
}

// Undo last allowance
async function undoLastAllowance() {
    if (!canUndoLastAllowance()) {
        alert('Cannot undo: No recent allowance found or other transactions have occurred since.');
        return;
    }
    
    if (!confirm('Are you sure you want to undo the last allowance addition? This will remove the allowance from all kids and cannot be undone.')) {
        return;
    }
    
    // Find and collect the most recent allowance transactions
    const allowanceTransactionsToUndo = [];
    const transactionsToKeep = [];
    let foundCompleteSet = false;
    
    for (let i = 0; i < appData.transactions.length; i++) {
        const transaction = appData.transactions[i];
        
        if (!foundCompleteSet && transaction.type === 'allowance' && !transaction.description.includes('catch-up')) {
            allowanceTransactionsToUndo.push(transaction);
            
            // Check if we have all kids
            if (allowanceTransactionsToUndo.length === appData.kids.length) {
                foundCompleteSet = true;
            }
        } else {
            transactionsToKeep.push(transaction);
        }
    }
    
    // Reverse the balance changes. The rotation week used when the undone
    // allowance was originally applied is the one just before the current
    // (already-advanced) rotation week -- compute this before reverting it below.
    allowanceTransactionsToUndo.forEach(transaction => {
        const kid = appData.kids.find(k => k.id === transaction.kidId);
        if (kid) {
            const originalRotationWeek = allowanceLogic.previousRotationWeek(appData.settings.rotationWeek);
            const distribution = allowanceLogic.distributeAllowance(transaction.amount, originalRotationWeek);

            kid.balances.save -= distribution.save;
            kid.balances.spend -= distribution.spend;
            kid.balances.share -= distribution.share;
        }
    });

    // Revert rotation week
    appData.settings.rotationWeek = allowanceLogic.previousRotationWeek(appData.settings.rotationWeek);
    
    // Update last allowance date to the previous allowance (if any)
    const previousAllowanceTransactions = transactionsToKeep.filter(t => t.type === 'allowance');
    if (previousAllowanceTransactions.length > 0) {
        appData.settings.lastAllowanceDate = previousAllowanceTransactions[0].date;
    } else {
        appData.settings.lastAllowanceDate = null;
    }
    
    // Create undo transaction records
    const undoDate = new Date().toISOString();
    const totalUndone = allowanceTransactionsToUndo.reduce((sum, t) => sum + t.amount, 0);
    const kidNames = allowanceTransactionsToUndo.map(t => t.kidName).join(', ');
    const originalDate = new Date(allowanceTransactionsToUndo[0].date).toLocaleDateString();
    
    const undoTransaction = {
        id: Date.now(),
        date: undoDate,
        kidId: 0, // Special ID for system transactions
        kidName: 'System',
        bucket: 'all',
        amount: totalUndone,
        description: `Undid weekly allowance from ${originalDate} - ${kidNames}: -$${totalUndone.toFixed(2)} total`,
        type: 'undo_allowance'
    };
    
    // Update transactions array
    appData.transactions = [undoTransaction, ...transactionsToKeep];

    await saveData();
    updateDashboardAfterTransaction();
    updateUndoButtonVisibility();
    renderNextAllowanceCard();

    alert(`Successfully undid allowance from ${originalDate}. Removed $${totalUndone.toFixed(2)} total from all kids.`);
}

// Update the addWeeklyAllowance function to close the confirmation modal
async function addWeeklyAllowance() {
    // Close confirmation modal if open
    closeAllowanceConfirmation();

    appData.kids.forEach(kid => {
        const age = allowanceLogic.calculateAge(kid.birthday);
        const distribution = allowanceLogic.distributeAllowance(age, appData.settings.rotationWeek);

        kid.balances.save += distribution.save;
        kid.balances.spend += distribution.spend;
        kid.balances.share += distribution.share;

        // Add transaction record
        const transaction = {
            id: Date.now() + kid.id,
            date: new Date().toISOString(),
            kidId: kid.id,
            kidName: kid.name,
            bucket: 'all',
            amount: age,
            description: 'Weekly allowance',
            type: 'allowance'
        };

        appData.transactions.unshift(transaction);
    });

    // Update rotation week
    appData.settings.rotationWeek = allowanceLogic.nextRotationWeek(appData.settings.rotationWeek);
    // Stamp the due instant this payment covers (the oldest unpaid one), or the
    // upcoming one if paying ahead, so the next scheduled run isn't skipped or doubled.
    const allowanceDay = appData.settings.allowanceDay || 'sunday';
    const now = new Date();
    const lastPaid = appData.settings.lastAllowanceDate ? new Date(appData.settings.lastAllowanceDate) : now;
    const dueNow = allowanceLogic.scheduledAllowancesBetween(lastPaid, now, allowanceDay);
    appData.settings.lastAllowanceDate = (dueNow.length > 0
        ? dueNow[0]
        : allowanceLogic.nextScheduledAllowance(now, allowanceDay)).toISOString();

    await saveData();

    // Check for goal completions after adding allowance
    for (const kid of appData.kids) {
        await checkGoalCompletion(kid);
    }

    updateDashboardAfterTransaction();
    updateUndoButtonVisibility(); // Show undo button
    renderNextAllowanceCard(); // Update the next allowance card

    alert('Weekly allowance added for all kids!');
}

// Update parent dashboard rendering to include undo button visibility
function showParentDashboard() {
    currentView = 'parent';

    // Update navigation tabs
    document.getElementById('nav-parent').classList.add('active');
    document.getElementById('nav-kids').classList.remove('active');

    // Show/hide dashboard views
    document.getElementById('parent-dashboard-view').classList.remove('hidden');
    document.getElementById('kids-dashboard-view').classList.add('hidden');
    
    // Render content
    renderParentControls();
    renderFamilyManagement();
    renderFamilySummary();
    renderGoalsSummary();
    renderParentRecentTransactions();
    updateUndoButtonVisibility(); // Check if undo button should be shown
}

// Restore data (placeholder for future implementation)
function restoreData() {
    alert('Data restore feature coming soon!');
}
