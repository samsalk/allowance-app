// Auth gate: the whole app sits behind one shared family PIN. The server
// (api/login.js) checks it and sets a signed HttpOnly session cookie; every
// /api/data request is rejected without that cookie, so this is real
// enforcement, not just a UI overlay.

// Entry point, called from app.js on DOMContentLoaded instead of loadData()
// being called directly.
async function initAuthGate() {
    let signedIn = false;
    try {
        const res = await fetch('/api/session', { credentials: 'same-origin' });
        signedIn = res.ok;
    } catch (e) {
        signedIn = false;
    }

    if (signedIn) {
        await onLoginSuccess();
    } else {
        showLoginScreen();
    }
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

    let ok = false;
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin })
        });
        ok = res.ok;
    } catch (e) {
        ok = false;
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Unlock';

    if (!ok) {
        errorEl.textContent = 'Incorrect PIN or no connection. Please try again.';
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
    try {
        await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (e) { /* cookie expires on its own */ }
    showLoginScreen();
}
