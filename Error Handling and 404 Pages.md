# Error Handling and 404 Pages

Sep 27, 2026 · @Kevin

## Overview

By the end of this lesson, your server will answer every mistake (a wrong URL, a broken file, bad data) with a clear, friendly response instead of a crash page that leaks your file paths.

You will add two new kinds of middleware and one frontend helper:

| What | Where | Job |
| --- | --- | --- |
| **404 handler** | `server.js` | Catches any request that no route or file answered |
| **Error handler** | `server.js` | Catches any error thrown inside a route |
| **`try/catch` on `fetch`** | `guestbook.html` | Shows a friendly message when something fails |

Files you will change: `server.js` and `guestbook.html`. New file: `public/404.html`.

## Before you start

1. **Finish the guestbook upgrade first.** This lesson builds on the structured guestbook entries and validation from that handout.
2. **Commit your current work** with Git.
3. **Check your Express version** in `package.json`. It should say `"express": "^5..."`. Express 5 automatically catches errors inside `async` routes and sends them to your error handler; Express 4 does not.

## Part 1: Break things on purpose

Before fixing anything, see what your server does right now when things go wrong. Write down what you see for each test; you will compare at the end.

**Test A: a page that does not exist.** Visit `http://localhost:3000/nothing-here`. Express sends a bare "Cannot GET /nothing-here" message with no styling and no way back to your site.

**Test B: an API route that does not exist.** Visit `/api/nothing`. You get the same HTML message, even though code calling an API expects JSON.

**Test C: a broken data file.**

1. Open `guestbook.json` and delete the very first `[` character. Save it.
2. Log in and visit `/api/guestbook`.
3. You see an error page with a **stack trace**: a list of file paths and line numbers from inside your server.

A stack trace is useful to you while coding, but on a live site it tells attackers exactly how your server is built. Users should never see one.

**Put the `[` back** in `guestbook.json` when you are done, or keep a broken copy to test with in Part 3.

## Part 2: A 404 handler

A 404 handler is just middleware placed **after** every route and after `express.static`. Express runs middleware top to bottom, so if a request reaches this point, nothing above it had an answer.

**Step 1.** Create `public/404.html`. Design it to match your site: a heading, a short friendly message, and a link back home. Keep your nav bar so lost visitors can find their way.

**Step 2.** In `server.js`, add this **below** the `app.use(express.static(...))` line and **above** `app.listen`:

```js
// 404 HANDLER - runs only if no route or static file answered
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});
```

Key ideas:

- **No path in `app.use(...)`** means this runs for every request that gets this far, whatever the URL or method.
- **Two kinds of answer:** API routes are called by JavaScript, which expects JSON. Pages are visited by people, who need a real page.
- **`res.status(404)`** matters even when you send a nice page. The status code tells browsers and search engines the page is missing. Without it, your 404 page would be sent as `200 OK`.

**Step 3.** Repeat Tests A and B from Part 1. You should now see your 404 page, and `{ "error": "Not found" }` for the API route. In DevTools, open the Network tab and confirm both show status `404`.

## Part 3: Error-handling middleware

When code inside a route throws an error, Express skips all normal middleware and jumps straight to your **error handler**. Express recognizes an error handler because it takes **four** parameters instead of three.

**Step 1.** Add this **below** your 404 handler and **above** `app.listen`:

```js
// ERROR HANDLER - the 4 parameters tell Express this handles errors
app.use((err, req, res, next) => {
    // Full details go to YOU, in the console and the log file
    const time = new Date().toISOString();
    console.error(`[${time}] ERROR ${req.method} ${req.path}`, err);
    fs.appendFile(LOG_FILE, `[${time}] ERROR ${req.method} ${req.path}: ${err.message}\n`, () => {});

    // If a response already started sending, let Express finish up
    if (res.headersSent) return next(err);

    // Errors with a status under 500 are the user's fault and safe to explain.
    // Anything else is our fault, so hide the details.
    const status = err.status || 500;
    const message = status < 500 ? err.message : 'Something went wrong on our end.';

    if (req.path.startsWith('/api/')) {
        return res.status(status).json({ error: message });
    }
    res.status(status).send('<h1>Something went wrong</h1><p>Please try again later.</p><a href="/">Back to home</a>');
});
```

Key ideas:

- **Log everything, show nothing.** You get the full error in your logs. The user gets a short, generic message.
- **`err.status`**: some errors come with their own status code. For example, if someone sends broken JSON, `express.json()` creates an error with status `400`.
- **Status 500** means "Internal Server Error: the problem is on our end."
- **Even the unused `next` must stay** in the parameter list. Remove it and Express treats this as normal middleware.
- **Express 5 bonus:** errors thrown inside `async` routes reach this handler automatically. In Express 4, you had to wrap every `async` route in `try/catch` and call `next(err)` yourself.

**Step 2.** Repeat Test C from Part 1 with a broken `guestbook.json`. Visiting `/api/guestbook` should now return `{ "error": "Something went wrong on our end." }` with status `500`. Check your terminal and `server.log`: the full error should be there instead.

**Step 3.** Test a `400` error. Paste this into the browser Console to send deliberately broken JSON:

```js
fetch('/api/guestbook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ this is not json'
}).then(async r => console.log(r.status, await r.json()));
```

You should see status `400` with a message explaining the JSON could not be parsed.

**Fix `guestbook.json`** before moving on.

## Part 4: Check your middleware order

Order is everything in Express. Every request travels down `server.js` from top to bottom and stops at the first thing that sends a response. Your file should now follow this outline:

```js
// 1. Setup: require statements, constants, helper functions

// 2. Middleware that runs on EVERY request
app.use(express.urlencoded(...));
app.use(express.json());
app.use(/* request logger */);
app.use(limiter);
app.use(session(...));

// 3. Routes: app.get(...), app.post(...)

// 4. Static files
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// 5. 404 handler: nothing above answered
app.use((req, res) => { ... });

// 6. Error handler: something above threw an error
app.use((err, req, res, next) => { ... });

// 7. Start the server
app.listen(PORT, ...);
```

**Quick quiz:** what would break if the 404 handler were placed above your routes? (Answer: every single request would get a 404, because the handler answers everything that reaches it.)

## Part 5: Handle errors on the frontend

Your server now sends clear errors, but your page still has to catch them. There are two different kinds of failure, and `fetch` treats them differently:

| What went wrong | What `fetch` does | How you catch it |
| --- | --- | --- |
| Server sent an error (`400`, `401`, `404`, `500`) | Returns normally, with `response.ok` set to `false` | Check `response.ok` |
| Server could not be reached (down, Wi-Fi off) | **Throws** an error | `try/catch` |

You need both checks. Your guestbook already checks `response.ok` when posting, but a crashed server would still break it silently.

**Step 1.** Add a spot for list errors in `guestbook.html`, just above your `<ul id="guestbook-list">`:

```html
<p id="list-error" role="alert"></p>
```

**Step 2.** Wrap `loadMessages` in `try/catch`, and check `response.ok` there too. Keep your existing code that builds each entry with `textContent`:

```js
async function loadMessages() {
    const listError = document.querySelector('#list-error');
    listError.textContent = '';

    try {
        const response = await fetch('/api/guestbook');
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            listError.textContent = data.error || 'Could not load messages.';
            return;
        }

        // ...your existing code that clears the list and adds each entry from data...
    } catch (err) {
        listError.textContent = 'Could not reach the server. Check your connection.';
    }
}
```

**Step 3.** Wrap the `fetch` in your submit handler the same way:

```js
document.querySelector('#guestbook-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = document.querySelector('#form-error');
    errorBox.textContent = '';

    try {
        const response = await fetch('/api/guestbook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: document.querySelector('#name').value,
                msg: document.querySelector('#msg').value
            })
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            errorBox.textContent = data.error || 'Something went wrong. Please try again.';
            return; // keep what the user typed
        }
    } catch (err) {
        errorBox.textContent = 'Could not reach the server. Check your connection.';
        return;
    }

    e.target.reset();
    loadMessages();
});
```

**Step 4.** Test both kinds of failure:

- **Server error:** break `guestbook.json` again and refresh the guestbook page. You should see "Something went wrong on our end." above the list, which is the message from your new error handler.
- **Server unreachable:** with the guestbook page open, stop your server with Ctrl+C, then try to post. You should see "Could not reach the server."

**Rule to remember:** every `fetch` call gets a `try/catch` for network failures and a `response.ok` check for server errors.

## Testing checklist

Compare each result with what you wrote down in Part 1.

- [ ] `/nothing-here` shows your designed 404 page with status `404`
- [ ] `/api/nothing` returns `{ "error": "Not found" }` with status `404`
- [ ] All your real pages and routes still work (the 404 handler is not blocking them)
- [ ] A broken `guestbook.json` returns a generic `500` message with no stack trace
- [ ] The full error details appear in your terminal and `server.log`
- [ ] Broken JSON sent from the Console returns a `400`
- [ ] With a broken `guestbook.json`, the guestbook page shows an error above the list
- [ ] With the server stopped, posting shows "Could not reach the server"
- [ ] Validation errors (like a name of only spaces) still appear under the form

## Stretch goals

1. **A designed 500 page.** Create `public/500.html` and send it from the error handler instead of the plain HTML string.
2. **Show the missing path.** On your 404 page, use JavaScript to display "We couldn't find /whatever-they-typed" using `window.location.pathname`. Put it on the page with `textContent`, never `innerHTML`, since the URL comes from the user.
3. **A shared fetch helper.** Your `try/catch` and `response.ok` checks repeat on every call. Move them into one `apiFetch(url, options)` function in `public/api.js` that returns the data or throws an `Error` with a friendly message. Load it on each page with `<script src="/api.js"></script>`. Bonus: on a `401`, send the user to the login page.
4. **Throw your own errors.** In a route, create an error with a status and throw it; your error handler will send it to the user:

```js
const err = new Error('That entry does not exist.');
err.status = 404;
throw err;
```
