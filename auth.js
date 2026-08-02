// Auth gate: the whole app sits behind one shared family login (see README).
// This is a real Supabase Auth session, not just a UI overlay -- Row Level
// Security on the `family_data` table rejects any request without one, so
// the PIN is the only way in even if someone has the anon key from view-source.

// Entry point, called from app.js on DOMContentLoaded instead of loadData()
// being called directly.
async function initAuthGate() {
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (session) {
        await onLoginSuccess();
    } else {
        showLoginScreen();
    }

    // Handles both an expired/revoked refresh token while the app is open,
    // and a successful sign-in from the login form.
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        if (!session) {
            showLoginScreen();
        }
    });
}

async function onLoginSuccess() {
    hideLoginScreen();
    await loadData();
    initializeApp();
}

async function handleLoginSubmit(event) {
    event.preventDefault();

    const pinInput = document.getElementById('login-pin');
    const errorEl = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit-btn');
    const pin = pinInput.value;

    errorEl.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking...';

    const { error } = await supabaseClient.auth.signInWithPassword({
        email: FAMILY_EMAIL,
        password: pin
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Unlock';

    if (error) {
        errorEl.textContent = 'Incorrect PIN. Please try again.';
        errorEl.classList.remove('hidden');
        pinInput.value = '';
        pinInput.focus();
        return;
    }

    pinInput.value = '';
    await onLoginSuccess();
}

function showLoginScreen() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('setup-wizard').classList.add('hidden');
    document.getElementById('main-navigation').classList.add('hidden');
    document.getElementById('kids-dashboard-view').classList.add('hidden');
    document.getElementById('parent-dashboard-view').classList.add('hidden');
    document.getElementById('catchup-alert').classList.add('hidden');

    setTimeout(() => document.getElementById('login-pin').focus(), 0);
}

function hideLoginScreen() {
    document.getElementById('login-screen').classList.add('hidden');
}

async function signOut() {
    await supabaseClient.auth.signOut();
    // The onAuthStateChange listener above reacts to the session going away
    // and shows the login screen -- no need to duplicate that here.
}
