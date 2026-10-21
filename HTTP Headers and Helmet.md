# HTTP Headers and Helmet

Sep 27, 2026 · @Kevin

## Overview

Every request and response on the web carries **headers**: short labeled notes that travel alongside the data, like the address and stamps on an envelope. By the end of this lesson you will read and set headers yourself, and use the Helmet package to add a set of security headers that protect your visitors.

A header is always a **name** and a **value**:

```
Content-Type: application/json
```

The **body** is the letter inside the envelope (your HTML page or JSON data). The **headers** are instructions written on the outside: what kind of data this is, who sent it, how long to keep it, and what the browser is allowed to do with it.

You will:

- Find headers you have already been using without noticing
- Read and set your own headers in Express
- Test your site against a real attack called clickjacking
- Add Helmet, then turn on its strongest protection, Content-Security-Policy

Files you will change: `server.js`, and every HTML page that has a `<script>` block. New folder: `public/js/`.

## Before you start

1. **Finish the error handling lesson first.** Your server should have a 404 handler and an error handler.
2. **Commit your current work** with Git. Part 5 moves code between files, so a clean restore point matters.
3. **Start your server** and log in, so you have a session cookie to look at.

## Part 1: Find the headers you have already been using

You have been using headers since your first `fetch` call. Time to see them.

**Step 1.** Open DevTools, go to the **Network** tab, and refresh your guestbook page.

**Step 2.** Click the `guestbook` request (the API call, not the page). Find the **Headers** panel. It has two lists:

- **Request Headers:** what your browser sent to the server
- **Response Headers:** what your server sent back

**Step 3.** Find each of these and write down its value:

| Header | Direction | Where you have seen it before |
| --- | --- | --- |
| `Content-Type` | Response | `res.json()` sets it to `application/json` for you |
| `Cookie` | Request | Your browser sends the `connect.sid` session cookie on every request. This is how `requireAuth` knows you are logged in. |
| `X-Powered-By` | Response | Express adds this automatically. What does it say? |
| Headers starting with `RateLimit` | Response | Your rate limiter reports how many requests you have left |

**Step 4.** Now click the `POST` request from posting a guestbook message and find `Content-Type` in its **Request** headers. You set that one yourself in your `fetch` call with `headers: { 'Content-Type': 'application/json' }`. It tells `express.json()` to parse the body.

**Think about it:** `X-Powered-By: Express` announces exactly what software your server runs. Why might an attacker find that useful? (Hint: if a security hole is found in Express, attackers search for sites that announce they use it.)

> You have also met one header only your server sees: `X-Forwarded-For`. When your site runs on Render, Render's proxy adds it with the visitor's real IP address. That is what `app.set('trust proxy', 1)` is for.

## Part 2: Read and set headers in Express

Express gives you one method to read a request header and one to set a response header:

| Method | Direction | Example |
| --- | --- | --- |
| `req.get(name)` | Read what the browser sent | `req.get('User-Agent')` |
| `res.set(name, value)` | Add to what you send back | `res.set('Cache-Control', 'no-store')` |

Header names are not case-sensitive, so `req.get('user-agent')` works too.

**Step 1.** Add this demo route to `server.js`:

```js
app.get('/api/headers-demo', (req, res) => {
    res.set('X-Student-Name', 'Your Name Here');
    res.json({
        browser: req.get('User-Agent'),
        languages: req.get('Accept-Language'),
        allRequestHeaders: req.headers
    });
});
```

**Step 2.** Visit `/api/headers-demo`. You will see everything your browser sent, including your `Cookie`. Then check the Network tab: your custom `X-Student-Name` header should appear in the **Response** headers.

**Step 3.** Open the same URL in a different browser, or on your phone. The `User-Agent` changes. Websites use this header to tell phones from laptops.

### A header with a real job: Cache-Control

Browsers sometimes save (cache) responses and reuse them instead of asking your server again. That is great for images, but bad for data that changes, like your visitor count.

**Step 4.** Update your `/api/stats` route so browsers never cache it:

```js
app.get('/api/stats', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ visitorCount });
});
```

`no-store` means "never save this, always ask the server." Headers do not just describe the response; they tell the browser how to behave. Hold on to that idea for the rest of this lesson.

## Part 3: The clickjacking test

Any website can load your site inside an `<iframe>` right now. An attacker can make that iframe invisible and place it over a fake button like "Claim your prize!" The visitor thinks they are clicking the prize button, but they are really clicking a button on **your** site underneath. This attack is called **clickjacking**.

**Step 1.** Create a file called `attacker.html` **outside** your project folder, for example on your desktop:

```html
<!DOCTYPE html>
<html>
<body>
    <h1>Click the button to win a prize!</h1>
    <iframe src="http://localhost:3000/" width="800" height="500" style="opacity: 0.5;"></iframe>
</body>
</html>
```

**Step 2.** Make sure your server is running, then double-click `attacker.html` to open it in your browser.

**Step 3.** Your home page appears inside someone else's page. The `opacity: 0.5` makes it see-through so you can tell it is there. A real attacker would set it to `0`, making it completely invisible.

The browser allows this because your server never said otherwise. Keep `attacker.html` open; in Part 4 a single header will block it.

## Part 4: Add Helmet

You could add every security header by hand with `res.set(...)`, but it is easy to miss one or get a value wrong. **Helmet** is a small middleware package that sets about a dozen security headers with good defaults in one line.

**Step 1.** Install it:

```bash
npm install helmet
```

**Step 2.** Require it at the top of `server.js`:

```js
const helmet = require('helmet');
```

**Step 3.** Add it right after `app.set('trust proxy', 1)`, **before** all your other middleware, so every response gets the headers, including 404 and error pages:

```js
// Security headers on every response.
// CSP is off for now; you will turn it on in Part 5.
app.use(helmet({ contentSecurityPolicy: false }));
```

We are leaving Content-Security-Policy off for now because it would break your pages. You will see why, and fix it, in Part 5.

**Step 4.** Restart your server, refresh a page, and check the **Response** headers in the Network tab. `X-Powered-By` is gone, and several new headers appeared. These are the most important ones:

| Header | What it tells the browser | What it protects against |
| --- | --- | --- |
| `X-Frame-Options: SAMEORIGIN` | Only my own site may put me in an iframe | Clickjacking |
| `Strict-Transport-Security` | Only ever connect to me with HTTPS, for the next year | Attackers on public Wi-Fi downgrading visitors to unencrypted HTTP |
| `X-Content-Type-Options: nosniff` | Trust my `Content-Type`; do not guess | Tricking the browser into running an uploaded file as a script |
| `Referrer-Policy: no-referrer` | Do not tell other sites which of my pages a visitor came from | Leaking private URLs to other sites |
| `X-Powered-By` (removed) | Nothing; it is gone | Advertising which software you run |

**Step 5.** Refresh `attacker.html`. The iframe should now be blank or show an error, and the Console will explain that the page refused to be framed. One header stopped the attack.

> `Strict-Transport-Security` does nothing on `localhost`, because your computer uses plain HTTP. It matters on Render, which serves your site over HTTPS.

## Part 5: Turn on Content-Security-Policy

**Content-Security-Policy** (CSP) is the most powerful security header. It gives the browser an allowlist: "only run scripts, load images and apply styles from these places." Anything not on the list is blocked.

**Step 1.** Change your Helmet line to use all the defaults, including CSP:

```js
app.use(helmet());
```

**Step 2.** Restart your server, open your home page and try to log in. **Nothing happens.** Open the Console and you will see an error like this:

```
Refused to execute inline script because it violates the following
Content Security Policy directive: "script-src 'self'"
```

**Why this happens:** Helmet's default policy includes `script-src 'self'`, which means "only run JavaScript from **files** on my own server." A `<script>` block written directly inside your HTML is an **inline** script, so it is blocked.

That sounds annoying, but it is the whole point. When an attacker sneaks code into your page (like the guestbook attack), it is always inline. The browser cannot tell your inline scripts apart from an attacker's, so CSP blocks them all. Scripts that come from separate files on your server are allowed, because an attacker cannot put files on your server.

### Move your scripts into files

**Step 3.** Create a folder `public/js/`.

**Step 4.** For **each** HTML page with a `<script>` block:

1. Create a matching file, like `public/js/guestbook.js`.
2. Cut everything **between** `<script>` and `</script>` and paste it into the new file. Do not copy the tags themselves.
3. Replace the whole block in the HTML with one line in the same spot, at the bottom of the `<body>`:

```html
<script src="/js/guestbook.js"></script>
```

Do this for `index.html`, `guestbook.html`, `dashboard.html`, and any other page with a script.

**Step 5.** Restart and test every page: logging in, logging out, loading the guestbook and posting. Everything should work again, now with CSP protecting you.

### Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| A button with `onclick="..."` does nothing | Inline event handlers are also blocked | Use `addEventListener` in your JS file instead |
| Images from another website are missing | Default `img-src` only allows your own server | Add that site to `img-src` (below) |
| A library loaded from a CDN does not work | Default `script-src` only allows your own server | Add the CDN to `script-src` (below) |

To allow another site, list it in Helmet's options. Helmet keeps all its other defaults and only changes the lines you give it:

```js
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            'img-src': ["'self'", 'data:', 'https://images.example.com'],
            'script-src': ["'self'", 'https://cdn.jsdelivr.net']
        }
    }
}));
```

Note that `'self'` needs single quotes **inside** the string. Only allow sites you actually use: every site on the list is one you are trusting with your visitors.

## Part 6: Watch CSP block an XSS attack

In the guestbook upgrade, you fixed the XSS hole with `textContent`. Now you will temporarily bring the hole back to see CSP stop the attack on its own.

**Step 1.** In `public/js/guestbook.js`, find the line that sets the message text and **temporarily** change it to use `innerHTML`:

```js
msg.innerHTML = entry.msg; // TEMPORARY - unsafe on purpose
```

**Step 2.** Post this message: `<img src="x" onerror="alert('hacked')">`

**Step 3.** Watch what happens:

- **No alert pops up.** CSP blocked the `onerror` code from running.
- **A broken image icon appears.** The attacker's HTML still made it onto the page; only the script was stopped.
- **The Console shows a CSP error** explaining what was blocked.

**Step 4.** Change the line **back** to `textContent`, and delete the test message from `guestbook.json`.

**What this proves:** security works in layers. `textContent` stops the attack at the source. CSP is a safety net that catches it if you ever make a mistake. You want both, because each one covers the other's gaps: CSP did not stop the broken image, and one forgotten `innerHTML` could undo all your `textContent` work.

## Part 7: Check your live site on Render

**Step 1.** Commit and push your changes, including the updated `package.json` with `helmet` in it. Wait for Render to redeploy.

**Step 2.** Open your live Render URL, then check the Response headers in the Network tab. Confirm that `Strict-Transport-Security` is there and `X-Powered-By` is not.

**Step 3.** Test every page on the live site: logging in, logging out, the guestbook and the dashboard. CSP problems sometimes appear only on the live site, for example with an image link that worked locally.

**Step 4.** Edit `attacker.html` so the `iframe` points at your Render URL instead of `localhost`, and open it. Your live site should refuse to load in the frame.

**Step 5.** Scan your live site with [Mozilla's HTTP Observatory](https://developer.mozilla.org/en-US/observatory), which grades a site's security headers. Screenshot your grade and compare it with a classmate's.

## Testing checklist

- [ ] `/api/headers-demo` shows your request headers, and `X-Student-Name` appears in the response headers
- [ ] `/api/stats` responds with `Cache-Control: no-store`
- [ ] `X-Powered-By` no longer appears on any response
- [ ] `Content-Security-Policy`, `X-Frame-Options` and `X-Content-Type-Options` appear on your pages
- [ ] `attacker.html` can no longer frame your site, locally or on Render
- [ ] No `<script>` blocks remain in your HTML; all scripts load from `public/js/`
- [ ] Logging in, logging out, the guestbook and the dashboard all work with CSP on
- [ ] The Part 6 attack shows no alert, and your guestbook is back to `textContent`
- [ ] Your 404 page also has the security headers
- [ ] Your live Render site shows `Strict-Transport-Security`

## Stretch goals

1. **Stop caching all API data.** Write one small middleware that sets `Cache-Control: no-store` on every route starting with `/api/`, so you do not have to add it route by route.
2. **A request ID.** Write middleware that gives every request a random ID with `crypto.randomUUID()`, sends it back in an `X-Request-Id` response header, and includes it in your log lines. If a user reports a bug, they can give you the ID and you can find the exact request in `server.log`.
3. **Lock down browser features.** Add a `Permissions-Policy` header with `res.set` that turns off the camera, microphone and location for your site: `camera=(), microphone=(), geolocation=()`.
4. **Improve your Observatory grade.** Read what the HTTP Observatory report says you could improve, pick one item, and fix it.
