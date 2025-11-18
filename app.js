// Save, Spend, Share - Family Allowance Tracker
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
let currentGoalKidId = null; // For goal management modal
let currentView = 'kids'; // 'kids' or 'parent'
let missedWeeksData = null; // For catch-up functionality
let currentEditKidId = null; // For kid profile editing

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    loadData();
    initializeApp();
});

// Load data from localStorage with error handling and recovery
function loadData() {
    try {
        const savedData = localStorage.getItem('saveSpendShareData');
        if (savedData) {
            // Try to parse the saved data
            const parsedData = JSON.parse(savedData);
            
            // Validate the data structure
            if (validateDataStructure(parsedData)) {
                appData = parsedData;
                console.log('Data loaded successfully from localStorage');
                
                // Migrate existing data to birthday-only system
                migrateToCalculatedAges();
                
                showMainDashboard();
            } else {
                throw new Error('Invalid data structure detected');
            }
        } else {
            console.log('No saved data found, showing welcome screen');
            showWelcomeScreen();
        }
    } catch (error) {
        console.error('Failed to load data:', error);
        
        // Try to load from backup
        const backupData = localStorage.getItem('saveSpendShareData_backup');
        if (backupData) {
            try {
                const parsedBackup = JSON.parse(backupData);
                if (validateDataStructure(parsedBackup)) {
                    appData = parsedBackup;
                    console.log('Data restored from backup');
                    
                    // Save the restored data as current
                    saveData();
                    
                    // Migrate existing data to birthday-only system
                    migrateToCalculatedAges();
                    
                    showMainDashboard();
                    
                    alert('Your data was corrupted but has been restored from backup. Please verify your information is correct.');
                    return;
                }
            } catch (backupError) {
                console.error('Backup data is also corrupted:', backupError);
            }
        }
        
        // If all else fails, start fresh but warn the user
        alert('Unable to load your saved data. The app will start fresh. If you have a backup file, you can restore it using the backup feature.');
        showWelcomeScreen();
    }
}

// Validate data structure to ensure it has required properties
function validateDataStructure(data) {
    if (!data || typeof data !== 'object') return false;
    
    // Check for required top-level properties
    if (!data.kids || !Array.isArray(data.kids)) return false;
    if (!data.settings || typeof data.settings !== 'object') return false;
    if (!data.transactions || !Array.isArray(data.transactions)) return false;
    
    // Validate each kid has required properties
    for (const kid of data.kids) {
        if (!kid.id || !kid.name || !kid.birthday) return false;
        if (!kid.balances || typeof kid.balances !== 'object') return false;
        if (typeof kid.balances.save !== 'number' || 
            typeof kid.balances.spend !== 'number' || 
            typeof kid.balances.share !== 'number') return false;
    }
    
    // Validate settings structure
    if (typeof data.settings.rotationWeek !== 'number') return false;
    
    return true;
}

// Migrate existing data to use calculated ages
function migrateToCalculatedAges() {
    let needsMigration = false;
    
    appData.kids.forEach(kid => {
        if (kid.birthday) {
            const calculatedAge = calculateAge(kid.birthday);
            if (kid.age !== calculatedAge) {
                console.log(`Updating ${kid.name}'s age from ${kid.age} to ${calculatedAge} based on birthday`);
                kid.age = calculatedAge;
                needsMigration = true;
            }
        }
    });
    
    if (needsMigration) {
        saveData();
    }
}

// Save data to localStorage with error handling and backup
function saveData() {
    try {
        // Create a backup of current data before saving new data
        const currentData = localStorage.getItem('saveSpendShareData');
        if (currentData) {
            localStorage.setItem('saveSpendShareData_backup', currentData);
        }
        
        // Save new data
        const dataToSave = JSON.stringify(appData);
        localStorage.setItem('saveSpendShareData', dataToSave);
        
        // Verify the save was successful by reading it back
        const savedData = localStorage.getItem('saveSpendShareData');
        if (!savedData || savedData !== dataToSave) {
            throw new Error('Data verification failed after save');
        }
        
        console.log('Data saved successfully at', new Date().toISOString());
        
    } catch (error) {
        console.error('Failed to save data:', error);
        
        // Try to restore from backup if save failed
        const backupData = localStorage.getItem('saveSpendShareData_backup');
        if (backupData) {
            try {
                localStorage.setItem('saveSpendShareData', backupData);
                console.log('Restored data from backup');
            } catch (restoreError) {
                console.error('Failed to restore from backup:', restoreError);
                alert('Critical error: Unable to save data. Please backup your data immediately using the Backup button.');
            }
        } else {
            alert('Critical error: Unable to save data and no backup available. Please backup your data immediately.');
        }
    }
}

// Initialize the app based on current state
function initializeApp() {
    // Check if we need to add weekly allowance
    checkAndAddWeeklyAllowance();
    // Check for birthdays and update ages
    checkBirthdays();
}

// Show welcome screen
function showWelcomeScreen() {
    document.getElementById('welcome-screen').classList.remove('hidden');
    document.getElementById('setup-wizard').classList.add('hidden');
    document.getElementById('main-dashboard').classList.add('hidden');
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

// Validate kids information
function validateKidsInfo() {
    const kidSetups = document.querySelectorAll('.kid-setup');
    let valid = true;
    
    kidSetups.forEach((setup, index) => {
        const name = setup.querySelector('.kid-name').value.trim();
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
        const name = setup.querySelector('.kid-name').value.trim();
        const birthday = setup.querySelector('.kid-birthday').value;
        
        if (name && birthday) {
            const age = calculateAge(birthday);
            const balanceHtml = `
                <div class="kid-balances mb-6 p-4 border-2 border-gray-200 rounded-lg" data-kid-index="${index}">
                    <h4 class="font-semibold mb-3 text-gray-600">${name} (Age ${age}) - Weekly Allowance: $${age}.00</h4>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-save mb-1">💰 Save Balance</label>
                            <input type="number" class="balance-save w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-save" step="0.01" min="0" placeholder="0.00">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-spend mb-1">🛍️ Spend Balance</label>
                            <input type="number" class="balance-spend w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-spend" step="0.01" min="0" placeholder="0.00">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-share mb-1">❤️ Share Balance</label>
                            <input type="number" class="balance-share w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-share" step="0.01" min="0" placeholder="0.00">
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
        const name = setup.querySelector('.kid-name').value.trim();
        
        if (name) {
            const goalHtml = `
                <div class="kid-goal mb-6 p-4 border-2 border-gray-200 rounded-lg" data-kid-index="${index}">
                    <h4 class="font-semibold mb-3 text-gray-600">${name}'s Savings Goal (Optional)</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Goal Name</label>
                            <input type="text" class="goal-name w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g., New Bike, Art Set">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Target Amount</label>
                            <input type="number" class="goal-target w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" step="0.01" min="0" placeholder="0.00">
                        </div>
                    </div>
                </div>
            `;
            goalsContainer.innerHTML += goalHtml;
        }
    });
}

// Complete setup and save data
function completeSetup() {
    const kidSetups = document.querySelectorAll('.kid-setup');
    const balanceSetups = document.querySelectorAll('.kid-balances');
    const goalSetups = document.querySelectorAll('.kid-goal');
    
    appData.kids = [];
    
    kidSetups.forEach((setup, index) => {
        const name = setup.querySelector('.kid-name').value.trim();
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
            const goalName = goalSetup.querySelector('.goal-name').value.trim();
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
    
    saveData();
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
    document.getElementById('nav-kids').classList.add('border-blue-500', 'text-blue-600');
    document.getElementById('nav-kids').classList.remove('border-transparent', 'text-gray-500');
    document.getElementById('nav-parent').classList.remove('border-blue-500', 'text-blue-600');
    document.getElementById('nav-parent').classList.add('border-transparent', 'text-gray-500');
    
    // Show/hide dashboard views
    document.getElementById('kids-dashboard-view').classList.remove('hidden');
    document.getElementById('parent-dashboard-view').classList.add('hidden');
    
    // Render content
    renderNextAllowanceCard();
    renderKidsBalanceCards();
    renderKidsRecentTransactions();
}

function showParentDashboard() {
    currentView = 'parent';
    
    // Update navigation tabs
    document.getElementById('nav-parent').classList.add('border-blue-500', 'text-blue-600');
    document.getElementById('nav-parent').classList.remove('border-transparent', 'text-gray-500');
    document.getElementById('nav-kids').classList.remove('border-blue-500', 'text-blue-600');
    document.getElementById('nav-kids').classList.add('border-transparent', 'text-gray-500');
    
    // Show/hide dashboard views
    document.getElementById('parent-dashboard-view').classList.remove('hidden');
    document.getElementById('kids-dashboard-view').classList.add('hidden');
    
    // Render content
    renderParentControls();
    renderFamilyManagement();
    renderFamilySummary();
    renderGoalsSummary();
    renderParentRecentTransactions();
}

// Render kids dashboard cards
function renderKidsDashboard() {
    const container = document.getElementById('kids-balance-cards');
    if (!container) return; // Exit if the element doesn't exist (different view)
    container.innerHTML = '';
    
    appData.kids.forEach(kid => {
        const age = calculateAge(kid.birthday);
        const totalBalance = kid.balances.save + kid.balances.spend + kid.balances.share;
        const weeklyAllowance = age;
        const nextAllowance = calculateNextAllowanceDistribution(kid);
        
        let goalHtml = '';
        if (kid.goal) {
            const progress = Math.min((kid.balances.save / kid.goal.target) * 100, 100);
            const remaining = Math.max(kid.goal.target - kid.balances.save, 0);
            
            // Determine progress bar color based on completion percentage
            let progressColor = '';
            if (progress < 33) {
                progressColor = 'from-red-400 to-red-500'; // Red gradient for low progress
            } else if (progress < 67) {
                progressColor = 'from-yellow-400 to-orange-500'; // Yellow-orange gradient for medium progress
            } else if (progress < 100) {
                progressColor = 'from-green-400 to-green-500'; // Green gradient for high progress
            } else {
                progressColor = 'from-emerald-400 to-emerald-600'; // Emerald gradient for completed
            }
            
            goalHtml = `
                <div class="mt-3 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                    <div class="flex justify-between items-center mb-2">
                        <div class="text-sm font-semibold text-gray-800">🎯 ${kid.goal.name}</div>
                        <div class="text-sm font-bold text-gray-700">${progress.toFixed(0)}%</div>
                    </div>
                    
                    <div class="relative w-full bg-gray-200 rounded-full h-3 mb-3 overflow-hidden shadow-inner">
                        <div class="absolute top-0 left-0 h-full bg-gradient-to-r ${progressColor} rounded-full transition-all duration-500 ease-out shadow-sm" 
                             style="width: ${progress}%"></div>
                        ${progress >= 100 ? '<div class="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-pulse"></div>' : ''}
                    </div>
                    
                    <div class="flex justify-between items-center text-xs text-gray-600 mb-2">
                        <span class="font-medium">$${kid.balances.save.toFixed(2)} saved</span>
                        <span class="font-medium">$${remaining.toFixed(2)} to go</span>
                    </div>
                    
                    <div class="text-center">
                        <span class="text-xs text-gray-500">Target: $${kid.goal.target.toFixed(2)}</span>
                        <button onclick="editGoal(${kid.id})" class="ml-3 text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors duration-200">
                            ✏️ Edit Goal
                        </button>
                    </div>
                </div>
            `;
        } else {
            goalHtml = `
                <div class="mt-3 p-3 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                    <button onclick="setGoal(${kid.id})" class="w-full text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors duration-200">
                        🎯 + Set Savings Goal
                    </button>
                </div>
            `;
        }
        
        const cardHtml = `
            <div class="bg-white rounded-lg shadow-lg p-6">
                <div class="text-center mb-4">
                    <h3 class="text-xl font-bold text-gray-800">${getKidEmoji(kid.name)} ${kid.name} (${age})</h3>
                    <p class="text-sm text-gray-600">Weekly: $${weeklyAllowance}.00</p>
                    <p class="text-sm text-blue-600 font-medium">Next allowance: +$${nextAllowance.save} Save, +$${nextAllowance.spend} Spend, +$${nextAllowance.share} Share</p>
                </div>
                
                <!-- Stats-style bucket display -->
                <div class="grid grid-cols-3 gap-3 mb-4">
                    <div class="bg-save/10 border border-save/20 rounded-xl p-4 text-center shadow-sm">
                        <div class="text-3xl mb-2">💰</div>
                        <div class="text-sm font-semibold text-save mb-1">SAVE</div>
                        <div class="text-2xl font-bold text-save">$${kid.balances.save.toFixed(2)}</div>
                    </div>
                    
                    <div class="bg-spend/10 border border-spend/20 rounded-xl p-4 text-center shadow-sm">
                        <div class="text-3xl mb-2">🛍️</div>
                        <div class="text-sm font-semibold text-spend mb-1">SPEND</div>
                        <div class="text-2xl font-bold text-spend">$${kid.balances.spend.toFixed(2)}</div>
                    </div>
                    
                    <div class="bg-share/10 border border-share/20 rounded-xl p-4 text-center shadow-sm">
                        <div class="text-3xl mb-2">❤️</div>
                        <div class="text-sm font-semibold text-share mb-1">SHARE</div>
                        <div class="text-2xl font-bold text-share">$${kid.balances.share.toFixed(2)}</div>
                    </div>
                </div>
                
                ${goalHtml}
                
                <div class="mt-4 pt-4 border-t border-gray-200 text-center">
                    <span class="text-lg font-bold text-gray-800">📊 Total: $${totalBalance.toFixed(2)}</span>
                </div>
            </div>
        `;
        
        container.innerHTML += cardHtml;
    });
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

// Get emoji for kid (simple alternating)
function getKidEmoji(name) {
    if (name.toLowerCase() === 'noah') return '👦';
    return name.toLowerCase().includes('a') || name.toLowerCase().includes('e') ? '👧' : '👦';
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
function addMoney() {
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
    
    saveData();
    
    // Check for goal completion after adding money
    checkGoalCompletion(kid);
    
    updateDashboardAfterTransaction();
    
    alert(`Added: $${amount.toFixed(2)} to ${kid.name}'s ${bucket} bucket.`);
}

// Record spending (renamed from recordTransaction for clarity)
function recordSpending() {
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
    
    saveData();
    updateDashboardAfterTransaction();
    
    alert(`Recorded: $${amount.toFixed(2)} deducted from ${kid.name}'s ${bucket} bucket.`);
}

// Add weekly allowance
function addWeeklyAllowance() {
    appData.kids.forEach(kid => {
        const allowanceAmount = kid.age;
        const baseAmount = Math.floor(allowanceAmount / 3);
        const remainder = allowanceAmount % 3;
        
        // Distribute base amount
        kid.balances.save += baseAmount;
        kid.balances.spend += baseAmount;
        kid.balances.share += baseAmount;
        
        // Distribute remainder based on rotation
        if (remainder > 0) {
            const buckets = ['save', 'spend', 'share'];
            const rotationIndex = (appData.settings.rotationWeek - 1) % 3;
            
            for (let i = 0; i < remainder; i++) {
                const bucketIndex = (rotationIndex + i) % 3;
                kid.balances[buckets[bucketIndex]] += 1;
            }
        }
        
        // Add transaction record
        const transaction = {
            id: Date.now() + kid.id,
            date: new Date().toISOString(),
            kidId: kid.id,
            kidName: kid.name,
            bucket: 'all',
            amount: allowanceAmount,
            description: 'Weekly allowance',
            type: 'allowance'
        };
        
        appData.transactions.unshift(transaction);
    });
    
    // Update rotation week
    appData.settings.rotationWeek = (appData.settings.rotationWeek % 3) + 1;
    appData.settings.lastAllowanceDate = new Date().toISOString();
    
    saveData();
    
    // Check for goal completions after adding allowance
    appData.kids.forEach(kid => {
        checkGoalCompletion(kid);
    });
    
    updateDashboardAfterTransaction();
    renderNextAllowanceCard(); // Update the next allowance card
    
    alert('Weekly allowance added for all kids!');
}

// Check and automatically add weekly allowance
function checkAndAddWeeklyAllowance() {
    if (!appData.settings.lastAllowanceDate) {
        return; // First time setup, don't auto-add
    }
    
    const lastDate = new Date(appData.settings.lastAllowanceDate);
    const now = new Date();
    const daysSince = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
    
    // Only add allowance on the configured allowance day (default: Sunday)
    const allowanceDay = appData.settings.allowanceDay || 'sunday';
    const targetDayOfWeek = allowanceDay === 'sunday' ? 0 : 
                           allowanceDay === 'monday' ? 1 :
                           allowanceDay === 'tuesday' ? 2 :
                           allowanceDay === 'wednesday' ? 3 :
                           allowanceDay === 'thursday' ? 4 :
                           allowanceDay === 'friday' ? 5 :
                           allowanceDay === 'saturday' ? 6 : 0;
    
    const currentDayOfWeek = now.getDay();
    
    // Check if it's been at least a week AND it's the right day
    if (daysSince >= 7 && currentDayOfWeek === targetDayOfWeek) {
        console.log(`Adding weekly allowance on ${allowanceDay} (${daysSince} days since last)`);
        addWeeklyAllowance();
    } else if (daysSince >= 7) {
        console.log(`Allowance due but waiting for ${allowanceDay} (today is ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][currentDayOfWeek]})`);
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

// Render recent transactions
function renderRecentTransactions() {
    const container = document.getElementById('recent-transactions');
    const recentTransactions = appData.transactions.slice(0, 10);
    
    if (recentTransactions.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">No transactions yet.</p>';
        return;
    }
    
    container.innerHTML = '';
    
    recentTransactions.forEach(transaction => {
        const date = new Date(transaction.date).toLocaleDateString();
        const bucketEmoji = transaction.bucket === 'save' ? '💰' : 
                           transaction.bucket === 'spend' ? '🛍️' : 
                           transaction.bucket === 'share' ? '❤️' : '📅';
        
        const transactionHtml = `
            <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div class="flex items-center space-x-3">
                    <span class="text-lg">${bucketEmoji}</span>
                    <div>
                        <div class="font-medium text-gray-800">
                            ${transaction.kidName} - ${transaction.type === 'allowance' ? 'Allowance' : transaction.bucket.charAt(0).toUpperCase() + transaction.bucket.slice(1)}
                        </div>
                        <div class="text-sm text-gray-600">${transaction.description}</div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="font-bold ${transaction.type === 'allowance' ? 'text-green-600' : 'text-red-600'}">
                        ${transaction.type === 'allowance' ? '+' : '-'}$${transaction.amount.toFixed(2)}
                    </div>
                    <div class="text-xs text-gray-500">${date}</div>
                </div>
            </div>
        `;
        
        container.innerHTML += transactionHtml;
    });
}

// Show transaction history modal (implemented above)
// This function is now implemented in the "Show transaction history modal" section

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
function checkGoalCompletion(kid) {
    if (kid.goal && kid.balances.save >= kid.goal.target) {
        showGoalCelebration(kid);
        return true;
    }
    return false;
}

// Show goal completion celebration
function showGoalCelebration(kid) {
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
    saveData();
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
function checkBirthdays() {
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
        saveData();
        if (document.getElementById('main-dashboard').classList.contains('hidden') === false) {
            renderKidsDashboard();
            renderRecentTransactions();
        }
    }
}

// Open goal management modal
function openGoalManagement(kidId) {
    const kid = appData.kids.find(k => k.id === kidId);
    if (!kid) return;
    
    currentGoalKidId = kidId;
    
    const modal = document.getElementById('goal-management-modal');
    const nameInput = document.getElementById('goal-name-input');
    const targetInput = document.getElementById('goal-target-input');
    
    if (kid.goal) {
        nameInput.value = kid.goal.name;
        targetInput.value = kid.goal.target;
    } else {
        nameInput.value = '';
        targetInput.value = '';
    }
    
    modal.classList.remove('hidden');
}

// Close goal management modal
function closeGoalManagement() {
    document.getElementById('goal-management-modal').classList.add('hidden');
    currentGoalKidId = null;
}

// Save goal from modal
function saveGoal() {
    if (!currentGoalKidId) return;
    
    const kid = appData.kids.find(k => k.id === currentGoalKidId);
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

    saveData();
    renderKidsBalanceCards();
    closeGoalManagement();
}

// Remove goal
function removeGoal() {
    if (!currentGoalKidId) return;
    
    const kid = appData.kids.find(k => k.id === currentGoalKidId);
    if (!kid) return;
    
    if (confirm(`Are you sure you want to remove ${kid.name}'s savings goal?`)) {
        delete kid.goal;
        saveData();
        renderKidsBalanceCards();
        closeGoalManagement();
    }
}

// Show transaction history modal
function showTransactionHistory() {
    const modal = document.getElementById('transaction-history-modal');
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
    
    modal.classList.remove('hidden');
    filterTransactionHistory(); // Initial load
}

// Close transaction history modal
function closeTransactionHistory() {
    document.getElementById('transaction-history-modal').classList.add('hidden');
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
        container.innerHTML = '<p class="text-gray-500 text-center py-4">No transactions match your filters.</p>';
        return;
    }
    
    container.innerHTML = '';
    
    transactions.forEach(transaction => {
        const date = new Date(transaction.date).toLocaleDateString();
        const time = new Date(transaction.date).toLocaleTimeString();
        
        let bucketEmoji = '📅';
        let bucketName = 'All Buckets';
        
        if (transaction.bucket === 'save') {
            bucketEmoji = '💰';
            bucketName = 'Save';
        } else if (transaction.bucket === 'spend') {
            bucketEmoji = '🛍️';
            bucketName = 'Spend';
        } else if (transaction.bucket === 'share') {
            bucketEmoji = '❤️';
            bucketName = 'Share';
        }
        
        let typeColor = 'text-gray-600';
        let amountPrefix = '';
        
        if (transaction.type === 'allowance') {
            typeColor = 'text-green-600';
            amountPrefix = '+';
        } else if (transaction.type === 'deduction') {
            typeColor = 'text-red-600';
            amountPrefix = '-';
        } else if (transaction.type === 'goal_completed') {
            typeColor = 'text-purple-600';
            amountPrefix = '🎯';
        } else if (transaction.type === 'birthday') {
            typeColor = 'text-blue-600';
            amountPrefix = '🎂';
        }
        
        const transactionHtml = `
            <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div class="flex items-center space-x-3">
                    <span class="text-lg">${bucketEmoji}</span>
                    <div>
                        <div class="font-medium text-gray-800">
                            ${transaction.kidName} - ${bucketName}
                        </div>
                        <div class="text-sm text-gray-600">${transaction.description}</div>
                        <div class="text-xs text-gray-500">${date} at ${time}</div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="font-bold ${typeColor}">
                        ${amountPrefix}${transaction.amount > 0 ? '$' + transaction.amount.toFixed(2) : ''}
                    </div>
                    <div class="text-xs text-gray-500 capitalize">${transaction.type.replace('_', ' ')}</div>
                </div>
            </div>
        `;
        
        container.innerHTML += transactionHtml;
    });
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
    const missedWeeks = [];
    const lastDate = new Date(lastAllowanceDate);
    const now = new Date(currentDate);
    
    // Start from the week after the last allowance
    let weekStart = new Date(lastDate);
    weekStart.setDate(weekStart.getDate() + 7);
    
    // Find all missed weeks up to current week
    while (weekStart <= now) {
        const daysSinceWeekStart = Math.floor((now - weekStart) / (1000 * 60 * 60 * 24));
        
        // Only include weeks that are at least 7 days old (complete weeks)
        if (daysSinceWeekStart >= 7) {
            missedWeeks.push({
                weekStart: new Date(weekStart),
                weekEnd: new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000),
                dateRange: getWeekDateRange(weekStart)
            });
        }
        
        // Move to next week
        weekStart.setDate(weekStart.getDate() + 7);
    }
    
    return missedWeeks;
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
        <div class="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 class="font-semibold text-blue-800 mb-3">📅 Missed Weeks:</h4>
            <div class="space-y-2">
                ${missedWeeksData.specificWeeks.map((week, index) => `
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-blue-700">Week ${index + 1}: ${week.dateRange}</span>
                        <span class="text-blue-600 font-medium">$${appData.kids.reduce((sum, kid) => sum + kid.age, 0).toFixed(2)} total</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    kidsContainer.innerHTML += missedWeeksHtml;
    
    // Then show kid selection controls
    appData.kids.forEach(kid => {
        const weeklyAmount = kid.age;
        const totalAmount = weeklyAmount * missedWeeksData.missedWeeks;
        
        const kidHtml = `
            <div class="p-4 border border-gray-200 rounded-lg">
                <div class="flex items-center justify-between mb-3">
                    <h4 class="font-semibold text-gray-800">${getKidEmoji(kid.name)} ${kid.name} (Age ${kid.age})</h4>
                    <span class="text-sm text-gray-600">$${weeklyAmount}.00 per week</span>
                </div>
                <div class="flex items-center space-x-3 mb-2">
                    <label class="text-sm font-medium text-gray-700">Weeks to add:</label>
                    <select id="catchup-weeks-${kid.id}" class="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        ${Array.from({length: missedWeeksData.missedWeeks + 1}, (_, i) => 
                            `<option value="${i}" ${i === missedWeeksData.missedWeeks ? 'selected' : ''}>${i}</option>`
                        ).join('')}
                    </select>
                    <span class="text-sm text-gray-600">Total: $<span id="catchup-total-${kid.id}">${totalAmount.toFixed(2)}</span></span>
                </div>
                <div class="text-xs text-gray-500">
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
            const previewElement = this.parentElement.parentElement.querySelector('.text-xs.text-gray-500');
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
function addAllMissedAllowances() {
    if (!missedWeeksData) return;
    
    const weeksToAdd = missedWeeksData.missedWeeks;
    addMissedAllowancesForWeeks(weeksToAdd);
    
    dismissCatchupAlert();
    alert(`Added ${weeksToAdd} week${weeksToAdd > 1 ? 's' : ''} of allowances for all kids!`);
}

// Add selected allowances from review modal
function addSelectedAllowances() {
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
    
    // Update last allowance date
    appData.settings.lastAllowanceDate = new Date().toISOString();
    saveData();
    
    // Check for goal completions
    appData.kids.forEach(kid => {
        checkGoalCompletion(kid);
    });
    
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

// Add missed allowances for a specific kid
function addMissedAllowancesForKid(kid, weeksToAdd) {
    const processingDate = new Date(); // Actual date when catch-up is processed
    
    for (let week = 0; week < weeksToAdd; week++) {
        const allowanceAmount = kid.age;
        const baseAmount = Math.floor(allowanceAmount / 3);
        const remainder = allowanceAmount % 3;
        
        // Distribute base amount
        kid.balances.save += baseAmount;
        kid.balances.spend += baseAmount;
        kid.balances.share += baseAmount;
        
        // Distribute remainder based on rotation
        if (remainder > 0) {
            const buckets = ['save', 'spend', 'share'];
            const rotationIndex = (appData.settings.rotationWeek - 1 + week) % 3;
            
            for (let i = 0; i < remainder; i++) {
                const bucketIndex = (rotationIndex + i) % 3;
                kid.balances[buckets[bucketIndex]] += 1;
            }
        }
        
        // Get the specific week information for description
        const specificWeek = missedWeeksData.specificWeeks[week];
        const weekRange = specificWeek ? specificWeek.dateRange : getWeekDateRange(new Date(missedWeeksData.lastDate.getTime() + (week + 1) * 7 * 24 * 60 * 60 * 1000));
        
        const transaction = {
            id: Date.now() + kid.id + week,
            date: processingDate.toISOString(), // Use actual processing date
            kidId: kid.id,
            kidName: kid.name,
            bucket: 'all',
            amount: allowanceAmount,
            description: `Weekly allowance for ${weekRange} (catch-up)`, // Clear catch-up indicator
            type: 'allowance'
        };
        
        appData.transactions.unshift(transaction);
    }
    
    // Update rotation week
    appData.settings.rotationWeek = ((appData.settings.rotationWeek - 1 + weeksToAdd) % 3) + 1;
}

// Add missed allowances for all kids for specified weeks
function addMissedAllowancesForWeeks(weeksToAdd) {
    appData.kids.forEach(kid => {
        addMissedAllowancesForKid(kid, weeksToAdd);
    });
    
    // Update last allowance date
    appData.settings.lastAllowanceDate = new Date().toISOString();
    saveData();
    
    // Check for goal completions
    appData.kids.forEach(kid => {
        checkGoalCompletion(kid);
    });
    
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
    const allowanceAmount = calculateAge(kid.birthday);
    const baseAmount = Math.floor(allowanceAmount / 3);
    const remainder = allowanceAmount % 3;
    
    let distribution = {
        save: baseAmount,
        spend: baseAmount,
        share: baseAmount
    };
    
    // Add remainder based on current rotation
    if (remainder > 0) {
        const buckets = ['save', 'spend', 'share'];
        const rotationIndex = (appData.settings.rotationWeek - 1) % 3;
        
        for (let i = 0; i < remainder; i++) {
            const bucketIndex = (rotationIndex + i) % 3;
            distribution[buckets[bucketIndex]] += 1;
        }
    }
    
    return distribution;
}

// Render kids balance cards (updated for new container)
function renderKidsBalanceCards() {
    const container = document.getElementById('kids-balance-cards');
    if (!container) return; // Exit if the element doesn't exist (different view)
    container.innerHTML = '';
    
    appData.kids.forEach(kid => {
        const totalBalance = kid.balances.save + kid.balances.spend + kid.balances.share;
        const weeklyAllowance = kid.age;
        const nextAllowance = calculateNextAllowanceDistribution(kid);
        
        let goalHtml = '';
        if (kid.goal) {
            const progress = Math.min((kid.balances.save / kid.goal.target) * 100, 100);
            const remaining = Math.max(kid.goal.target - kid.balances.save, 0);
            
            // Determine progress bar color based on completion percentage
            let progressColor = '';
            if (progress < 33) {
                progressColor = 'from-red-400 to-red-500'; // Red gradient for low progress
            } else if (progress < 67) {
                progressColor = 'from-yellow-400 to-orange-500'; // Yellow-orange gradient for medium progress
            } else if (progress < 100) {
                progressColor = 'from-green-400 to-green-500'; // Green gradient for high progress
            } else {
                progressColor = 'from-emerald-400 to-emerald-600'; // Emerald gradient for completed
            }
            
            goalHtml = `
                <div class="mt-3 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                    <div class="flex justify-between items-center mb-2">
                        <div class="text-sm font-semibold text-gray-800">🎯 ${kid.goal.name}</div>
                        <div class="text-sm font-bold text-gray-700">${progress.toFixed(0)}%</div>
                    </div>
                    
                    <div class="relative w-full bg-gray-200 rounded-full h-3 mb-3 overflow-hidden shadow-inner">
                        <div class="absolute top-0 left-0 h-full bg-gradient-to-r ${progressColor} rounded-full transition-all duration-500 ease-out shadow-sm" 
                             style="width: ${progress}%"></div>
                        ${progress >= 100 ? '<div class="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-pulse"></div>' : ''}
                    </div>
                    
                    <div class="flex justify-between items-center text-xs text-gray-600 mb-2">
                        <span class="font-medium">$${kid.balances.save.toFixed(2)} saved</span>
                        <span class="font-medium">$${remaining.toFixed(2)} to go</span>
                    </div>
                    
                    <div class="text-center">
                        <span class="text-xs text-gray-500">Target: $${kid.goal.target.toFixed(2)}</span>
                        <button onclick="editGoal(${kid.id})" class="ml-3 text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors duration-200">
                            ✏️ Edit Goal
                        </button>
                    </div>
                </div>
            `;
        } else {
            goalHtml = `
                <div class="mt-3 p-3 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                    <button onclick="setGoal(${kid.id})" class="w-full text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors duration-200">
                        🎯 + Set Savings Goal
                    </button>
                </div>
            `;
        }
        
        const cardHtml = `
            <div class="bg-white rounded-lg shadow-lg p-6">
                <div class="text-center mb-4">
                    <h3 class="text-xl font-bold text-gray-800">${getKidEmoji(kid.name)} ${kid.name} (${kid.age})</h3>
                    <p class="text-sm text-gray-600">Weekly: $${weeklyAllowance}.00</p>
                    <p class="text-sm text-blue-600 font-medium">Next allowance: +$${nextAllowance.save} Save, +$${nextAllowance.spend} Spend, +$${nextAllowance.share} Share</p>
                </div>
                
                <!-- Stats-style bucket display -->
                <div class="grid grid-cols-3 gap-3 mb-4">
                    <div class="bg-save/10 border border-save/20 rounded-xl p-4 text-center shadow-sm">
                        <div class="text-3xl mb-2">💰</div>
                        <div class="text-sm font-semibold text-save mb-1">SAVE</div>
                        <div class="text-2xl font-bold text-save">$${kid.balances.save.toFixed(2)}</div>
                    </div>
                    
                    <div class="bg-spend/10 border border-spend/20 rounded-xl p-4 text-center shadow-sm">
                        <div class="text-3xl mb-2">🛍️</div>
                        <div class="text-sm font-semibold text-spend mb-1">SPEND</div>
                        <div class="text-2xl font-bold text-spend">$${kid.balances.spend.toFixed(2)}</div>
                    </div>
                    
                    <div class="bg-share/10 border border-share/20 rounded-xl p-4 text-center shadow-sm">
                        <div class="text-3xl mb-2">❤️</div>
                        <div class="text-sm font-semibold text-share mb-1">SHARE</div>
                        <div class="text-2xl font-bold text-share">$${kid.balances.share.toFixed(2)}</div>
                    </div>
                </div>
                
                ${goalHtml}
                
                <div class="mt-4 pt-4 border-t border-gray-200 text-center">
                    <span class="text-lg font-bold text-gray-800">📊 Total: $${totalBalance.toFixed(2)}</span>
                </div>
            </div>
        `;
        
        container.innerHTML += cardHtml;
    });
}

// Render kids recent transactions
function renderKidsRecentTransactions() {
    const container = document.getElementById('kids-recent-transactions');
    const recentTransactions = appData.transactions.slice(0, 5); // Show fewer for kids view
    
    if (recentTransactions.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">No activity yet.</p>';
        return;
    }
    
    container.innerHTML = '';
    
    recentTransactions.forEach(transaction => {
        const date = new Date(transaction.date).toLocaleDateString();
        const bucketEmoji = transaction.bucket === 'save' ? '💰' : 
                           transaction.bucket === 'spend' ? '🛍️' : 
                           transaction.bucket === 'share' ? '❤️' : '📅';
        
        const transactionHtml = `
            <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div class="flex items-center space-x-3">
                    <span class="text-lg">${bucketEmoji}</span>
                    <div>
                        <div class="font-medium text-gray-800">
                            ${transaction.kidName} - ${transaction.type === 'allowance' ? 'Allowance' : transaction.bucket.charAt(0).toUpperCase() + transaction.bucket.slice(1)}
                        </div>
                        <div class="text-sm text-gray-600">${transaction.description}</div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="font-bold ${transaction.type === 'allowance' ? 'text-green-600' : 'text-red-600'}">
                        ${transaction.type === 'allowance' ? '+' : '-'}$${transaction.amount.toFixed(2)}
                    </div>
                    <div class="text-xs text-gray-500">${date}</div>
                </div>
            </div>
        `;
        
        container.innerHTML += transactionHtml;
    });
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
        <div class="flex justify-between items-center">
            <span class="text-gray-600">Total Family Balance:</span>
            <span class="font-bold text-lg">$${totalBalance.toFixed(2)}</span>
        </div>
        <div class="flex justify-between items-center">
            <span class="text-save">💰 Total Savings:</span>
            <span class="font-semibold text-save">$${totalSave.toFixed(2)}</span>
        </div>
        <div class="flex justify-between items-center">
            <span class="text-spend">🛍️ Total Spending:</span>
            <span class="font-semibold text-spend">$${totalSpend.toFixed(2)}</span>
        </div>
        <div class="flex justify-between items-center">
            <span class="text-share">❤️ Total Sharing:</span>
            <span class="font-semibold text-share">$${totalShare.toFixed(2)}</span>
        </div>
        <div class="flex justify-between items-center pt-2 border-t border-gray-200">
            <span class="text-gray-600">Weekly Allowance:</span>
            <span class="font-semibold">$${totalWeeklyAllowance.toFixed(2)}</span>
        </div>
    `;
}

// Render goals summary for parent dashboard
function renderGoalsSummary() {
    const container = document.getElementById('goals-summary');
    
    const kidsWithGoals = appData.kids.filter(kid => kid.goal);
    
    if (kidsWithGoals.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">No active savings goals.</p>';
        return;
    }
    
    container.innerHTML = '';
    
    kidsWithGoals.forEach(kid => {
        const progress = Math.min((kid.balances.save / kid.goal.target) * 100, 100);
        const remaining = Math.max(kid.goal.target - kid.balances.save, 0);
        
        const goalHtml = `
            <div class="p-3 border border-gray-200 rounded-lg">
                <div class="flex justify-between items-center mb-2">
                    <span class="font-medium">${getKidEmoji(kid.name)} ${kid.name}</span>
                    <span class="text-sm text-gray-600">${progress.toFixed(0)}%</span>
                </div>
                <div class="text-sm text-gray-700 mb-1">${kid.goal.name}</div>
                <div class="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div class="bg-save h-2 rounded-full" style="width: ${progress}%"></div>
                </div>
                <div class="flex justify-between text-xs text-gray-600">
                    <span>$${kid.balances.save.toFixed(2)} saved</span>
                    <span>$${remaining.toFixed(2)} to go</span>
                </div>
            </div>
        `;
        
        container.innerHTML += goalHtml;
    });
}

// Render parent recent transactions (show more)
function renderParentRecentTransactions() {
    const container = document.getElementById('parent-recent-transactions');
    const recentTransactions = appData.transactions.slice(0, 20); // Show more for parent view
    
    if (recentTransactions.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">No transactions yet.</p>';
        return;
    }
    
    container.innerHTML = '';
    
    recentTransactions.forEach(transaction => {
        const date = new Date(transaction.date).toLocaleDateString();
        const time = new Date(transaction.date).toLocaleTimeString();
        const bucketEmoji = transaction.bucket === 'save' ? '💰' : 
                           transaction.bucket === 'spend' ? '🛍️' : 
                           transaction.bucket === 'share' ? '❤️' : '📅';
        
        let typeColor = 'text-gray-600';
        let amountPrefix = '';
        
        if (transaction.type === 'allowance') {
            typeColor = 'text-green-600';
            amountPrefix = '+';
        } else if (transaction.type === 'deduction') {
            typeColor = 'text-red-600';
            amountPrefix = '-';
        } else if (transaction.type === 'goal_completed') {
            typeColor = 'text-purple-600';
            amountPrefix = '🎯';
        } else if (transaction.type === 'birthday') {
            typeColor = 'text-blue-600';
            amountPrefix = '🎂';
        }
        
        const transactionHtml = `
            <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div class="flex items-center space-x-3">
                    <span class="text-lg">${bucketEmoji}</span>
                    <div>
                        <div class="font-medium text-gray-800">
                            ${transaction.kidName} - ${transaction.type === 'allowance' ? 'Allowance' : transaction.bucket.charAt(0).toUpperCase() + transaction.bucket.slice(1)}
                        </div>
                        <div class="text-sm text-gray-600">${transaction.description}</div>
                        <div class="text-xs text-gray-500">${date} at ${time}</div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="font-bold ${typeColor}">
                        ${amountPrefix}${transaction.amount > 0 ? '$' + transaction.amount.toFixed(2) : ''}
                    </div>
                    <div class="text-xs text-gray-500 capitalize">${transaction.type.replace('_', ' ')}</div>
                </div>
            </div>
        `;
        
        container.innerHTML += transactionHtml;
    });
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
    
    appData.kids.forEach(kid => {
        const totalBalance = kid.balances.save + kid.balances.spend + kid.balances.share;
        const birthday = new Date(kid.birthday).toLocaleDateString();
        
        const cardHtml = `
            <div class="p-4 border border-gray-200 rounded-lg bg-gradient-to-br from-white to-gray-50">
                <div class="flex items-center justify-between mb-3">
                    <h4 class="font-semibold text-gray-800">${getKidEmoji(kid.name)} ${kid.name}</h4>
                    <button onclick="editKidProfile(${kid.id})" class="text-blue-500 hover:text-blue-700 text-sm font-medium transition-colors duration-200">
                        ✏️ Edit Profile
                    </button>
                </div>
                
                <div class="space-y-2 text-sm text-gray-600">
                    <div class="flex justify-between">
                        <span>Age:</span>
                        <span class="font-medium">${kid.age} years old</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Birthday:</span>
                        <span class="font-medium">${birthday}</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Weekly Allowance:</span>
                        <span class="font-medium text-green-600">$${kid.age}.00</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Total Balance:</span>
                        <span class="font-medium text-blue-600">$${totalBalance.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML += cardHtml;
    });
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
function saveKidProfile() {
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
    
    saveData();
    
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
            <div class="flex justify-between items-center">
                <span class="font-medium">${getKidEmoji(kid.name)} ${kid.name} (Age ${kid.age}):</span>
                <span class="font-bold">$${total.toFixed(2)}</span>
            </div>
            <div class="text-sm text-gray-600 ml-6">
                +$${distribution.save} Save, +$${distribution.spend} Spend, +$${distribution.share} Share
            </div>
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
function undoLastAllowance() {
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
    
    // Reverse the balance changes
    allowanceTransactionsToUndo.forEach(transaction => {
        const kid = appData.kids.find(k => k.id === transaction.kidId);
        if (kid) {
            const allowanceAmount = transaction.amount;
            const baseAmount = Math.floor(allowanceAmount / 3);
            const remainder = allowanceAmount % 3;
            
            // Remove base amount
            kid.balances.save -= baseAmount;
            kid.balances.spend -= baseAmount;
            kid.balances.share -= baseAmount;
            
            // Remove remainder (need to figure out which buckets got the extra)
            if (remainder > 0) {
                // Calculate which buckets got the extra dollars
                const buckets = ['save', 'spend', 'share'];
                const rotationIndex = (appData.settings.rotationWeek - 2 + 3) % 3; // Previous rotation
                
                for (let i = 0; i < remainder; i++) {
                    const bucketIndex = (rotationIndex + i) % 3;
                    kid.balances[buckets[bucketIndex]] -= 1;
                }
            }
        }
    });
    
    // Revert rotation week
    appData.settings.rotationWeek = appData.settings.rotationWeek === 1 ? 3 : appData.settings.rotationWeek - 1;
    
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
    
    saveData();
    updateDashboardAfterTransaction();
    updateUndoButtonVisibility();
    renderNextAllowanceCard();
    
    alert(`Successfully undid allowance from ${originalDate}. Removed $${totalUndone.toFixed(2)} total from all kids.`);
}

// Update the addWeeklyAllowance function to close the confirmation modal
function addWeeklyAllowance() {
    // Close confirmation modal if open
    closeAllowanceConfirmation();
    
    appData.kids.forEach(kid => {
        const allowanceAmount = kid.age;
        const baseAmount = Math.floor(allowanceAmount / 3);
        const remainder = allowanceAmount % 3;
        
        // Distribute base amount
        kid.balances.save += baseAmount;
        kid.balances.spend += baseAmount;
        kid.balances.share += baseAmount;
        
        // Distribute remainder based on rotation
        if (remainder > 0) {
            const buckets = ['save', 'spend', 'share'];
            const rotationIndex = (appData.settings.rotationWeek - 1) % 3;
            
            for (let i = 0; i < remainder; i++) {
                const bucketIndex = (rotationIndex + i) % 3;
                kid.balances[buckets[bucketIndex]] += 1;
            }
        }
        
        // Add transaction record
        const transaction = {
            id: Date.now() + kid.id,
            date: new Date().toISOString(),
            kidId: kid.id,
            kidName: kid.name,
            bucket: 'all',
            amount: allowanceAmount,
            description: 'Weekly allowance',
            type: 'allowance'
        };
        
        appData.transactions.unshift(transaction);
    });
    
    // Update rotation week
    appData.settings.rotationWeek = (appData.settings.rotationWeek % 3) + 1;
    appData.settings.lastAllowanceDate = new Date().toISOString();
    
    saveData();
    
    // Check for goal completions after adding allowance
    appData.kids.forEach(kid => {
        checkGoalCompletion(kid);
    });
    
    updateDashboardAfterTransaction();
    updateUndoButtonVisibility(); // Show undo button
    renderNextAllowanceCard(); // Update the next allowance card
    
    alert('Weekly allowance added for all kids!');
}

// Update parent dashboard rendering to include undo button visibility
function showParentDashboard() {
    currentView = 'parent';
    
    // Update navigation tabs
    document.getElementById('nav-parent').classList.add('border-blue-500', 'text-blue-600');
    document.getElementById('nav-parent').classList.remove('border-transparent', 'text-gray-500');
    document.getElementById('nav-kids').classList.remove('border-blue-500', 'text-blue-600');
    document.getElementById('nav-kids').classList.add('border-transparent', 'text-gray-500');
    
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
