const loginForm = document.querySelector('#login-form');
const logoutButton = document.querySelector('#logout');
const status = document.querySelector('#status');
const authError = document.querySelector('#auth-error');

async function getCsrfToken() {
    const response = await fetch('/api/csrf-token');
    const data = await response.json();
    return data.csrfToken;
}

async function checkAuthState() {
    const response = await fetch('/api/whoami');
    const data = await response.json();

    if (!data.loggedIn) {
        status.textContent = 'Please log in.';
        logoutButton.hidden = true;
        return;
    }

    status.textContent = '';
    const heading = document.createElement('h1');
    heading.textContent = `Welcome back, ${data.username}!`;
    status.append(heading);
    logoutButton.hidden = false;
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = '';

    const username = document.querySelector('#username').value;
    const password = document.querySelector('#password').value;
    const rememberMe = document.querySelector('#rememberMe').checked;

    try {
        const csrfToken = await getCsrfToken();
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-csrf-token': csrfToken
            },
            body: JSON.stringify({ username, password, rememberMe })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            authError.textContent = data.error || 'Login failed.';
            return;
        }

        window.location.href = '/guestbook';
    } catch (err) {
        authError.textContent = 'Could not reach the server. Check your connection.';
    }
});

logoutButton.addEventListener('click', async () => {
    const csrfToken = await getCsrfToken();
    await fetch('/logout', {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken }
    });
    window.location.reload();
});

checkAuthState();
