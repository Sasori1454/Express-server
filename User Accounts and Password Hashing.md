# User Accounts and Password Hashing

Sep 27, 2026 · @Kevin

## Overview

By the end of this lesson, visitors will create their own accounts, log in with a username and password, and your server will know **who** is logged in. An admin account, set up from `.env`, gets the dashboard.

**The most important rule in this lesson:** your server never stores a password. It stores a **hash**, a scrambled fingerprint of the password that cannot be turned back into the original. At login, the server checks whether what the user typed produces a matching fingerprint.

| Before | After |
| --- | --- |
| One shared password in `.env` | Each person has a username and password |
| Session stores `isAuthenticated: true` | Session stores `userId`, `username` and `role` |
| Dashboard is for anyone logged in | Dashboard is for the admin only |

In the next lesson, **Who Can Edit What**, you will use these accounts so people can only edit or delete their own guestbook messages.

Files you will change: `db.js`, `server.js`, `.env`, `.env.example`, `.gitignore`, `index.html`, `public/js/index.js`. New files: `hash-demo.js`, `public/register.html`, `public/js/register.js`.

## Before you start

1. **Finish the CRUD lesson first,** including the Edit and Delete buttons. You need `db.js`. Commit your work with Git.
2. **Install bcryptjs,** a password-hashing library:

```bash
npm install bcryptjs
```

3. **Update `.env`.** Remove `APP_PASSWORD` and add an admin account. Use a strong admin password of 12 or more characters:

```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=choose-a-long-admin-password
```

4. **Update `REQUIRED_ENV`** at the top of `server.js` to match:

```js
const REQUIRED_ENV = ['SESSION_SECRET', 'NASA_API_KEY', 'ADMIN_USERNAME', 'ADMIN_PASSWORD'];
```

5. **Update `.env.example`** the same way, with fake values.
6. **Add the data files to `.gitignore`,** so password hashes never go to GitHub:

```
users.json
guestbook.json
```

## Part 1: Why hashing matters

Imagine someone steals your `users.json`. If it held plain passwords, the thief could log in as everyone, and probably into their email too, since people reuse passwords. If it holds hashes, the thief has nothing they can log in with.

**Step 1.** Create `hash-demo.js` in your project folder:

```js
const bcrypt = require('bcryptjs');

async function demo() {
    const hash1 = await bcrypt.hash('password123', 12);
    const hash2 = await bcrypt.hash('password123', 12);
    console.log('Hash 1:', hash1);
    console.log('Hash 2:', hash2);

    console.log('Right password, hash 1:', await bcrypt.compare('password123', hash1));
    console.log('Right password, hash 2:', await bcrypt.compare('password123', hash2));
    console.log('Wrong password, hash 1:', await bcrypt.compare('password124', hash1));
}

demo();
```

**Step 2.** Run it with `node hash-demo.js`, then answer these in a comment at the top of the file:

1. The same password gave two **different** hashes, yet both matched. Why? (Hint: look up "salt" in password hashing.)
2. Could you work out the password just by looking at a hash?
3. bcrypt is **slow on purpose**. Why would that help protect passwords?

The `12` is the **cost**: how much work bcrypt does. One login takes a fraction of a second, but an attacker trying billions of guesses would need years.

## Part 2: Store users in db.js

Users are just another kind of data, so they belong in your data layer. A user record has **no password field**, only a hash:

```json
{
  "id": "8f14e45f-ceea-4e7a-9d3b-7c1b2a9f0e11",
  "username": "maya",
  "passwordHash": "$2b$12$Lq7x3F...",
  "role": "user",
  "createdAt": "2026-10-15T14:03:12.511Z"
}
```

**Step 1.** Let `readAll` and `writeAll` work with any file. In `db.js`, add a second file path and give both helpers a **default parameter**:

```js
const USERS_FILE = path.join(__dirname, 'users.json');

async function readAll(file = GUESTBOOK_FILE) {
    try {
        const text = await fs.readFile(file, 'utf8');
        return JSON.parse(text);
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
}

async function writeAll(data, file = GUESTBOOK_FILE) {
    await fs.writeFile(file, JSON.stringify(data, null, 2));
}
```

`file = GUESTBOOK_FILE` means "use the guestbook file unless told otherwise," so your guestbook functions keep working unchanged.

**Step 2.** Add the user functions:

```js
async function getUserByUsername(username) {
    const users = await readAll(USERS_FILE);
    return users.find(u => u.username === username.toLowerCase()) || null;
}

// Takes a passwordHash, never a password
async function addUser({ username, passwordHash, role = 'user' }) {
    const users = await readAll(USERS_FILE);
    const user = {
        id: crypto.randomUUID(),
        username: username.toLowerCase(),
        passwordHash,
        role,
        createdAt: new Date().toISOString()
    };
    users.push(user);
    await writeAll(users, USERS_FILE);
    return user;
}
```

**Step 3.** Add both to your exports:

```js
module.exports = {
    getAllEntries, getEntryById, addEntry, updateEntry, deleteEntry,
    getUserByUsername, addUser
};
```

- **`addUser` takes `passwordHash`, not `password`,** so it is hard to save a plain password by accident.
- **Usernames are stored in lowercase,** so `Maya` and `maya` cannot both sign up.

## Part 3: The register route

**Step 1.** At the top of `server.js`, require bcrypt:

```js
const bcrypt = require('bcryptjs');
```

**Step 2.** Add a validation helper next to `validateEntry`:

```js
// Returns an error message, or null if the username and password are OK
function validateCredentials(username, password) {
    if (typeof username !== 'string' || typeof password !== 'string') {
        return 'Username and password must be text.';
    }
    if (!/^[a-z0-9_]{3,20}$/.test(username.trim().toLowerCase())) {
        return 'Username must be 3 to 20 letters, numbers or underscores.';
    }
    if (password.length < 8 || password.length > 72) {
        return 'Password must be 8 to 72 characters.';
    }
    return null;
}
```

We never trim a password, because spaces are allowed in passwords. The 72-character limit is because bcrypt ignores anything longer.

**Step 3.** Add a helper that logs a user in:

```js
// Starts a brand-new session for this user
function startSession(req, user, rememberMe) {
    return new Promise((resolve, reject) => {
        req.session.regenerate((err) => {
            if (err) return reject(err);
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.role = user.role;
            if (rememberMe) {
                req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
            }
            resolve();
        });
    });
}
```

**`req.session.regenerate`** swaps in a fresh session ID at login, so an attacker cannot plant a session ID in someone's browser ahead of time. The `new Promise` wrapper just lets you write `await startSession(...)`.

**Step 4.** Add the register route:

```js
app.post('/register', authLimiter, async (req, res) => {
    const { username, password } = req.body;
    const error = validateCredentials(username, password);
    if (error) {
        return res.status(400).json({ error });
    }

    const cleanName = username.trim().toLowerCase();
    if (await db.getUserByUsername(cleanName)) {
        return res.status(409).json({ error: 'That username is already taken.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await db.addUser({ username: cleanName, passwordHash });

    await startSession(req, user); // new users are logged in right away
    res.status(201).json({ username: user.username });
});
```

- **`authLimiter`** is the strict limiter you already use on `/login`. It stops attackers from creating thousands of accounts.
- **Status `409 Conflict`** means the request clashes with data that already exists.
- **The plain password is never saved, logged or sent back.** It only exists inside this function for a moment.

## Part 4: Log in, log out, and who am I

**Step 1.** **Replace** your `/login` route, the one that checks `APP_PASSWORD`:

```js
app.post('/login', authLimiter, async (req, res) => {
    const { username, password, rememberMe } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = await db.getUserByUsername(username.trim());
    const passwordOk = user && await bcrypt.compare(password, user.passwordHash);

    if (!passwordOk) {
        // Same message whether the username or the password was wrong
        return res.status(401).json({ error: 'Incorrect username or password.' });
    }

    await startSession(req, user, rememberMe);
    res.json({ success: true, username: user.username });
});
```

- **One error message for both mistakes.** Separate "no such user" and "wrong password" messages would let attackers find out which usernames exist.
- **`bcrypt.compare`** hashes what the user typed, using the salt stored in `passwordHash`, and checks whether the results match.

**Step 2.** Your `/logout` route stays exactly the same. `req.session.destroy` removes everything.

**Step 3.** Replace `/api/whoami` so pages can find out who is logged in:

```js
app.get('/api/whoami', (req, res) => {
    if (!req.session.userId) {
        return res.json({ loggedIn: false });
    }
    res.json({
        loggedIn: true,
        userId: req.session.userId,
        username: req.session.username,
        role: req.session.role
    });
});
```

The `passwordHash` is never included. **A hash never leaves the server.**

## Part 5: Guards and the admin account

**Step 1.** Your two guards now check for a user ID instead of `isAuthenticated`. Change `req.session.isAuthenticated` to `req.session.userId` in both `requireAuth` and `requireLoginPage`:

```js
if (!req.session.userId) {
```

**Step 2.** Add a guard for admin-only pages, below the other two:

```js
// For admin-only pages: everyone else goes back to the home page
function requireAdminPage(req, res, next) {
    if (req.session.role !== 'admin') {
        return res.redirect('/');
    }
    next();
}
```

Then swap the dashboard's guard:

```js
app.get('/dashboard', requireAdminPage, (req, res) => {
```

### Create the admin account at startup

The admin's password lives in `.env`, never in your code. When the server starts, it creates the admin account, **hashed**, if one does not exist yet.

**Step 3.** Add this function above `app.listen`:

```js
// Creates the admin account from .env if it doesn't exist yet
async function ensureAdmin() {
    const existing = await db.getUserByUsername(process.env.ADMIN_USERNAME);
    if (existing) return;

    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await db.addUser({ username: process.env.ADMIN_USERNAME, passwordHash, role: 'admin' });
    console.log('Created admin account');
}
```

**Step 4.** Replace your `app.listen(...)` line so the admin exists **before** visitors arrive:

```js
ensureAdmin().then(() => {
    app.listen(PORT, () => console.log(`Server live on http://localhost:${PORT}`));
});
```

**Step 5.** Restart. You should see `Created admin account`. Open `users.json`: your admin password appears nowhere, only its hash. Restart again, and the message does not repeat.

> **Changing the admin password later?** Delete the admin's entry from `users.json` and restart. It is recreated with the new `.env` password.

## Part 6: Register and login pages

**Step 1.** Create `public/register.html`. Add your nav and styles to match your site:

```html
<h1>Create an account</h1>

<form id="register-form">
    <label for="username">Username</label>
    <input id="username" autocomplete="username" minlength="3" maxlength="20" required />

    <label for="password">Password (at least 8 characters)</label>
    <input id="password" type="password" autocomplete="new-password" minlength="8" maxlength="72" required />

    <label for="confirm">Confirm password</label>
    <input id="confirm" type="password" autocomplete="new-password" required />

    <button type="submit">Create account</button>
</form>
<p id="register-message" role="alert"></p>

<p>Already have an account? <a href="/">Log in</a></p>

<script src="/js/register.js"></script>
```

`autocomplete="new-password"` tells password managers this is a sign-up form, so they offer to create and save a strong password.

**Step 2.** Create `public/js/register.js`:

```js
const message = document.querySelector('#register-message');

document.querySelector('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    message.textContent = '';

    const username = document.querySelector('#username').value;
    const password = document.querySelector('#password').value;
    const confirm = document.querySelector('#confirm').value;

    if (password !== confirm) {
        message.textContent = 'Passwords do not match.';
        return;
    }

    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            message.textContent = data.error || 'Could not create your account.';
            return;
        }
        window.location.href = '/guestbook'; // already logged in
    } catch (err) {
        message.textContent = 'Could not reach the server. Check your connection.';
    }
});
```

The "passwords match" check only protects against typos, so it is fine for it to live in the browser. Notice that `confirm` is never sent to the server.

**Step 3.** In `index.html`, add a username field above the password field, and a sign-up link below the form:

```html
<label for="username">Username</label>
<input id="username" name="username" autocomplete="username" required>
```

```html
<p>New here? <a href="/register">Create an account</a></p>
```

**Step 4.** In `public/js/index.js`, send the username with the login request:

```js
const username = document.querySelector('#username').value;

// ...and in the fetch:
body: JSON.stringify({ username, password, rememberMe })
```

**Step 5.** Greet the user by name. In `checkAuthState`, replace the logged-in `status.innerHTML = ...` line with:

```js
status.textContent = '';
const heading = document.createElement('h1');
heading.textContent = `Welcome back, ${data.username}!`;
status.append(heading);
```

The username was typed by a user, so it goes in `textContent`, never `innerHTML`.

## Part 7: Deploy on Render

**Step 1.** In Render's **Environment** settings, add `ADMIN_USERNAME` and `ADMIN_PASSWORD`, and delete `APP_PASSWORD`.

**Step 2.** Run `git status`. Make sure `.env`, `users.json` and `guestbook.json` are **not** listed, then commit and push.

**Step 3.** Watch Render's **Logs** tab for `Created admin account`, then test the live site: register, log out, log in as the admin, and open the dashboard.

> **Accounts will disappear.** Render's free plan erases `users.json` whenever the server restarts. The admin account comes back automatically from your environment settings, but other accounts are lost. Your code is not broken: this is exactly what the database will fix later.

## Testing checklist

Use a normal window and a private window, so you can be two different users at once.

- [ ] `hash-demo.js` runs, and its three questions are answered
- [ ] The server creates the admin account once, and only once
- [ ] `users.json` contains `passwordHash` fields and **no** plain passwords
- [ ] Registering works and logs you in right away
- [ ] A taken username returns `409`; a short password returns `400`
- [ ] A wrong password and an unknown username show the **same** error
- [ ] `/api/whoami` shows your username and role, and never a hash
- [ ] The home page greets you by name
- [ ] A regular user visiting `/dashboard` is sent to the home page; the admin can open it
- [ ] The guestbook still works for every logged-in user
- [ ] `.env`, `users.json` and `guestbook.json` are not on GitHub

## Stretch goals

1. **Change password.** Add a form where a logged-in user enters their current password and a new one. Check the **current** password with `bcrypt.compare` before saving a new hash. Why does asking for the current password matter?
2. **Admin user list.** Show every user's username, role and join date on the dashboard, from a new admin-only API route. Make sure no hash is ever sent.
3. **Password strength meter.** On the register page, show "weak / okay / strong" as the user types. Remember, it is a helper, not a security check.

## Submit

Push your code, run the testing checklist on your live Render site, and send your teacher the Render URL.

## Grading rubric (10 points)

| Criterion | Points | Full credit | Partial credit |
| --- | --- | --- | --- |
| **Hashing** | 2 | Only `passwordHash` is stored; no plain passwords anywhere in `users.json` or logs | — |
| **Register** | 2 | Validates username and password, rejects duplicates with `409`, logs the new user in | 1 pt: works but is missing validation or the duplicate check |
| **Login** | 2 | Uses `bcrypt.compare`, shows one error for both wrong username and wrong password, regenerates the session | 1 pt: works but reveals which part was wrong |
| **Admin account** | 2 | Created from `.env` at startup, hashed; dashboard is admin-only | 1 pt: admin exists but the dashboard is open to all users |
| **Pages** | 1 | Register page works; home page greets the user by name with `textContent` | — |
| **Deployment** | 1 | Live on Render with admin variables set; no secrets or data files on GitHub | — |
| **Total** | **10** |  |  |

> **Grading tip:** in a private window on the live site, register a new account, check that `/api/whoami` shows the username and no hash, then visit `/dashboard` (should redirect). Log in as admin to confirm the dashboard opens.
