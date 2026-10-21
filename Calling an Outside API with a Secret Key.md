# Calling an Outside API with a Secret Key

Sep 27, 2026 · @Kevin

## Overview

You will build a page that shows NASA's Astronomy Picture of the Day for any date. Your server holds a secret API key and makes the request to NASA; your frontend only ever talks to your own server.

Every request makes a round trip in four steps:

1. Your page calls **your** route: `fetch('/api/space?date=2025-07-04')`
2. Your server adds the secret key and calls NASA
3. NASA answers your server with a large chunk of JSON
4. Your server sends back only the fields your page needs

This pattern is called a **proxy**, because your server makes the request on the browser's behalf. It matters for four reasons:

| Reason | What would happen without the proxy |
| --- | --- |
| **The key stays secret** | Anyone could open DevTools, copy your key and use up your limit |
| **CSP allows it** | Your Content-Security-Policy blocks `fetch` calls to other websites anyway |
| **You control the data** | Your page would depend on NASA's exact format; if it changes, every page breaks |
| **You can save requests** | Your server can remember answers and skip calling NASA again (Part 6) |

Files you will change: `server.js`, `.env`, `.gitignore`. New files: `.env.example`, `public/space.html`, `public/js/space.js`.

## Before you start

1. **Get a free NASA API key** at [api.nasa.gov](https://api.nasa.gov/). Fill in your name and email, and the key appears right away (it is also emailed to you). It allows 1,000 requests per hour.
2. **Check your Node version** by running `node -v` in your terminal. You need **18 or higher**, because that is when `fetch` became built into Node. Before that, servers needed an extra package to make requests.
3. **Commit your current work** with Git.

> NASA also has a shared key called `DEMO_KEY` for quick experiments, but it only allows 30 requests per hour and 50 per day. Use your own key for this project.

> **NASA moved this API in September 2026.** The old address, `api.nasa.gov/planetary/apod`, shuts down on December 1, 2026. This handout uses the new address, `science.nasa.gov/wp-json/wp/v2/apod-basic`, which sends back different data. If you find older tutorials online, their code will not match.

## Part 1: Store the key safely

An API key is like a password. Anyone who has it can use your quota, and on paid APIs, your money. It must never appear in your frontend code or on GitHub.

**Step 1.** Add the key to your `.env` file, next to your other secrets:

```
SESSION_SECRET=your-session-secret
APP_PASSWORD=your-password
NASA_API_KEY=paste-your-key-here
```

No quotes and no spaces around the `=`.

**Step 2.** Open `.gitignore` and make sure it contains both of these lines. If you do not have a `.gitignore`, create one in your project's main folder:

```
node_modules
.env
```

**Step 3.** Create a file called `.env.example`. It lists the **names** of every variable your project needs, with fake values. This one **does** go on GitHub, so anyone setting up your project (including future you) knows what to fill in:

```
SESSION_SECRET=replace-with-a-long-random-string
APP_PASSWORD=replace-with-a-password
NASA_API_KEY=get-one-free-at-api.nasa.gov
```

**Step 4.** Run `git status`. You should see `.env.example` listed, but **not** `.env`. If `.env` shows up, stop and fix your `.gitignore` before committing.

If `.env` was committed **before** you added it to `.gitignore`, Git keeps tracking it anyway. Run `git rm --cached .env` to stop tracking it without deleting your local copy, then commit.

> **If you ever push a key by accident,** deleting the file is not enough, because it stays in your Git history. Get a new key from NASA and treat the old one as stolen.

## Part 2: Explore the raw API response

Before writing code, look at what NASA actually sends back.

**Step 1.** Paste this into your browser's address bar, with your key in place of `YOUR_KEY`:

```
https://science.nasa.gov/wp-json/wp/v2/apod-basic/?api_key=YOUR_KEY
```

This is the only time your key goes in a browser, and only on your own computer. (Firefox shows JSON neatly. In Chrome, tick the "Pretty-print" box if it appears.)

**Step 2.** Look at the very first character: `[`. NASA sends back a **list** (an array) of recent pictures, newest first, not just one.

**Step 3.** Look at the first item in the list. These are the only fields you will use:

| Field | What it holds |
| --- | --- |
| `title` | The picture's title |
| `date` | The date, in `YYYY-MM-DD` format |
| `hdurl` | **The actual image file.** This is what goes in an `<img>`. |
| `alt` | A short, plain-text description of the image |
| `permalink` | NASA's web page about this picture |

**Step 4.** Spot two traps. Real APIs are often messy:

1. **The field named `url` is not the image.** Click it: it opens a web page. The image is in `hdurl`.
2. **`explanation` and `credit` are full of HTML tags** like `<a href=...>`. Cleaning those up is extra work, so we will skip them. The `alt` text describes the picture in plain words, and we will link to NASA's page for the full story.

Picking only the fields you need, and ignoring the rest, is a normal and important part of working with any API.

**Step 5.** NASA has a second address for a single day, with the date written as `YYMMDD` at the end. Try July 4, 2025:

```
https://science.nasa.gov/wp-json/wp/v2/apod-basic/250704?api_key=YOUR_KEY
```

This time the first character is `{`, not `[`: you get **one** picture, not a list. Your server will use this address whenever someone picks a date.

## Part 3: Build the proxy route

**Step 1.** Add this route to `server.js`, with your other routes:

```js
app.get('/api/space', async (req, res) => {
    const { date } = req.query;

    // Validation goes here in Part 4

    if (!process.env.NASA_API_KEY) {
        throw new Error('NASA_API_KEY is missing from .env');
    }

    // NASA has one address for the latest pictures, and another for one day.
    // The one-day address uses the date as YYMMDD: 2025-07-04 becomes 250704
    let address = 'https://science.nasa.gov/wp-json/wp/v2/apod-basic/';
    if (date) {
        const shortDate = date.slice(2).replaceAll('-', '');
        address = address + shortDate;
    }

    // Add the secret key on the server
    const nasaUrl = new URL(address);
    nasaUrl.searchParams.set('api_key', process.env.NASA_API_KEY);

    let nasaResponse;
    try {
        // Give up if NASA takes longer than 8 seconds
        nasaResponse = await fetch(nasaUrl, { signal: AbortSignal.timeout(8000) });
    } catch (err) {
        return res.status(502).json({ error: 'Could not reach NASA. Try again later.' });
    }

    if (nasaResponse.status === 404) {
        return res.status(404).json({ error: 'NASA has no picture for that date.' });
    }
    if (!nasaResponse.ok) {
        console.error('NASA error:', nasaResponse.status);
        return res.status(502).json({ error: 'NASA could not send a picture right now.' });
    }

    const data = await nasaResponse.json();

    // With a date, NASA sends one picture. Without one, it sends a list,
    // and the first item is the newest.
    const picture = Array.isArray(data) ? data[0] : data;

    // Send back only what our page needs, with names we chose
    res.json({
        title: picture.title,
        date: picture.date,
        imageUrl: picture.hdurl,
        description: picture.alt,
        nasaPage: picture.permalink
    });
});
```

Key ideas:

- **`req.query`** holds everything after the `?` in the URL. For `/api/space?date=2025-07-04`, `req.query.date` is `'2025-07-04'`.
- **Building the one-day address:** `date.slice(2)` drops the first two characters (`'2025-07-04'` becomes `'25-07-04'`), and `.replaceAll('-', '')` removes the dashes, giving `'250704'`.
- **`new URL(...)` and `searchParams.set`** add your key to the address safely.
- **`fetch` works on the server too.** It is the same `fetch` you use in the browser, now running in Node.
- **Two kinds of answer:** with a date, NASA sends one object; without, it sends a list. `Array.isArray(data)` checks which one arrived, and `data[0]` takes the first item of a list.
- **NASA's own `404`** means it has no picture for that day, so your server passes the `404` along with a friendly message.
- **The missing-key check throws** instead of responding. A missing key is your mistake, not the user's, so your error handler logs the details and sends a generic `500`.
- **Status `502`** means "Bad Gateway: the server I depend on failed." It tells the frontend the problem is NASA, not your code.
- **`AbortSignal.timeout(8000)`** stops waiting after 8 seconds, so a slow NASA cannot leave your visitors hanging forever.
- **Reshaping the data:** NASA sends a big, complicated object. Your server sends back **one** small object with five fields and clear names like `imageUrl`. Your frontend never needs to know about `hdurl`.

**Step 2.** Restart and visit `/api/space`. You should get one picture as short, clean JSON. Then try `/api/space?date=2025-07-04`.

**Step 3.** Click the `imageUrl` value in your JSON. It should open the picture itself, not a web page.

**Step 4.** Check the Network tab for your request. Your key appears **nowhere**: not in the URL, not in the headers, not in the response.

## Part 4: Validate the date

Right now, anything a user types after `?date=` goes straight to NASA and wastes a request from your quota. Check it first, and only call NASA for dates that can actually work.

Your rules:

| Rule | Example that fails |
| --- | --- |
| No date is fine; it means "today" |  |
| Must be text shaped like `YYYY-MM-DD` | `july 4`, `2025-7-4` |
| Must be a real calendar date | `2025-02-30` |
| Not before the first APOD, `1995-06-16` | `1990-01-01` |
| Not in the future | tomorrow's date |

**Step 1.** Add this helper function above your routes:

```js
// Returns an error message, or null if the date is OK
function validateApodDate(date) {
    if (date === undefined) return null; // no date means today

    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return 'Date must look like YYYY-MM-DD.';
    }

    // new Date() quietly rolls Feb 30 over to Mar 2, so convert it
    // back to text and check that it did not change
    const parsed = new Date(date + 'T00:00:00Z');
    if (isNaN(parsed) || parsed.toISOString().slice(0, 10) !== date) {
        return 'That is not a real date.';
    }

    if (date < '1995-06-16') {
        return 'The first picture is from 1995-06-16.';
    }

    const today = new Date().toISOString().slice(0, 10);
    if (date > today) {
        return 'That date is in the future.';
    }

    return null;
}
```

Key ideas:

- **The pattern `/^\d{4}-\d{2}-\d{2}$/`** is a **regular expression**. It means: start (`^`), exactly 4 digits, a dash, 2 digits, a dash, 2 digits, end (`$`).
- **Why check `typeof`?** A URL like `?date=a&date=b` makes `req.query.date` an **array**, not text. Never assume what the user sent.
- **Comparing dates as text works** for this format, because `YYYY-MM-DD` sorts the same way alphabetically as it does in time: `'1995-06-16' < '2025-07-04'` is `true`.

**Step 2.** Replace the `// Validation goes here in Part 4` comment in your route with:

```js
const dateError = validateApodDate(date);
if (dateError) {
    return res.status(400).json({ error: dateError });
}
```

**Step 3.** Test each rule by visiting these URLs. Each should return `400` with the matching message, and your terminal should show **no** NASA request for them:

- `/api/space?date=july`
- `/api/space?date=2025-02-30`
- `/api/space?date=1990-01-01`
- `/api/space?date=2099-01-01`
- `/api/space?date=2025-01-01&date=2025-01-02`

> NASA sometimes publishes a picture a little after midnight, so "today" may exist on your server before it exists at NASA. In that case your route sends its `404` "no picture for that date" message, which is fine.

## Part 5: Build the frontend page

**Step 1.** Create `public/space.html`. Add your nav and styles to match your site. Because of `extensions: ['html']`, it will load at `/space`:

```html
<h1>Space Picture of the Day</h1>

<form id="space-form">
    <label for="date">Pick a date</label>
    <input type="date" id="date" min="1995-06-16" />
    <button type="submit">Show picture</button>
</form>

<p id="status" role="status"></p>

<article id="result" hidden>
    <h2 id="title"></h2>
    <p id="date-shown"></p>
    <img id="picture" />
    <p id="description"></p>
    <a id="nasa-link" target="_blank" rel="noopener">Read the full story on NASA's website</a>
</article>

<script src="/js/space.js"></script>
```

A `<input type="date">` gives the user a calendar picker, and its value is already in `YYYY-MM-DD` format, which is exactly what your route expects.

**Step 2.** Create `public/js/space.js`:

```js
const form = document.querySelector('#space-form');
const dateInput = document.querySelector('#date');
const statusBox = document.querySelector('#status');
const result = document.querySelector('#result');

// Don't let the date picker choose future dates
dateInput.max = new Date().toISOString().slice(0, 10);

async function loadPicture(date) {
    statusBox.textContent = 'Loading...';
    result.hidden = true;

    const url = date ? `/api/space?date=${encodeURIComponent(date)}` : '/api/space';

    try {
        const response = await fetch(url);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            statusBox.textContent = data.error || 'Could not load the picture.';
            return;
        }

        showPicture(data);
        statusBox.textContent = '';
    } catch (err) {
        statusBox.textContent = 'Could not reach the server. Check your connection.';
    }
}

function showPicture(data) {
    document.querySelector('#title').textContent = data.title;
    document.querySelector('#date-shown').textContent = data.date;
    document.querySelector('#description').textContent = data.description;

    const img = document.querySelector('#picture');
    img.src = data.imageUrl;
    img.alt = data.description;

    document.querySelector('#nasa-link').href = data.nasaPage;

    result.hidden = false;
}

form.addEventListener('submit', (e) => {
    e.preventDefault();
    loadPicture(dateInput.value);
});

loadPicture(); // show the latest picture when the page opens
```

Key ideas:

- **The HTML already has every element,** including the `<img>` and the link. The script just fills them in, so there is no `createElement` needed.
- **A loading message** tells the user something is happening. Calls to outside APIs can take a second or two.
- **`encodeURIComponent`** makes any text safe to put in a URL.
- **`img.alt = data.description`** means screen-reader users hear what the picture shows.
- **API text goes in with `textContent`.** The text came from NASA, not from you, so treat it like user input.
- **`rel="noopener"`** on the link stops the new tab from being able to control your page, a good habit on every `target="_blank"` link.

**Step 3.** Visit `/space`. The title and text appear, but **the image is missing.** Open the Console: it is a Content-Security-Policy error. Your policy's `img-src` only allows images from your own server, and NASA's images live on `assets.science.nasa.gov`.

**Step 4.** Update your Helmet line in `server.js` to allow NASA's image server:

```js
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            'img-src': ["'self'", 'data:', 'https://assets.science.nasa.gov']
        }
    }
}));
```

**Step 5.** Restart and reload. The image should appear. Add `img { max-width: 100%; }` to your CSS so large photos fit the screen, and add a Space link to your nav.

## Part 6: Cache responses

The picture for July 4, 2025 will never change. If 30 classmates look it up, there is no reason to ask NASA 30 times. A **cache** is a place your server saves answers so it can reuse them.

Your cache rules:

- **Past dates** never change, so keep them.
- **Today's picture** (no date given) could change at midnight, so reuse it for 1 hour at most.
- **At most 100 entries**, so the cache cannot eat all your server's memory.

**Step 1.** Add these near your other constants at the top of `server.js`:

```js
const apodCache = new Map();
const TODAY_MAX_AGE = 60 * 60 * 1000; // 1 hour in milliseconds
const MAX_CACHE_SIZE = 100;
```

A `Map` stores key/value pairs, like an object, but with handy methods like `get`, `set`, `has` and `delete`, and it remembers the order entries were added.

**Step 2.** In your route, right after the date validation, check the cache before calling NASA:

```js
const cacheKey = date || 'today';
const cached = apodCache.get(cacheKey);
const isFresh = cacheKey !== 'today' || Date.now() - cached?.savedAt < TODAY_MAX_AGE;

if (cached && isFresh) {
    console.log('Cache hit:', cacheKey);
    return res.json(cached.data);
}
```

`cached?.savedAt` uses **optional chaining**: if `cached` is `undefined`, it gives `undefined` instead of crashing.

**Step 3.** At the end of your route, replace the final `res.json({ ... })` with a version that saves to the cache first:

```js
const result = {
    title: picture.title,
    date: picture.date,
    imageUrl: picture.hdurl,
    description: picture.alt,
    nasaPage: picture.permalink
};

apodCache.set(cacheKey, { data: result, savedAt: Date.now() });

// Too many entries? Remove the oldest one (a Map remembers insertion order)
if (apodCache.size > MAX_CACHE_SIZE) {
    const oldestKey = apodCache.keys().next().value;
    apodCache.delete(oldestKey);
}

res.json(result);
```

**Step 4.** Test it. Add `console.log('Asking NASA for', cacheKey);` just before your `fetch` call. Then look up the same date twice and watch your terminal. The first time you see `Asking NASA`; the second time you see `Cache hit`, and the page loads noticeably faster.

> The cache lives in memory, so it empties every time your server restarts. That is fine for a cache: the worst case is one extra request to NASA.

## Part 7: Protect your quota with a route limiter

Your key allows 1,000 NASA requests per hour, shared by **everyone** who visits your site. Your main rate limiter allows each visitor 100 requests every 10 seconds, so one person clicking fast (or a script) could burn through your whole quota in minutes.

Middleware does not have to run on every route. You can put it on **one** route by listing it before the handler, exactly like `requireAuth`.

**Step 1.** Create a stricter limiter near your main one:

```js
// Stricter limit just for the NASA route
const spaceLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 10,           // 10 lookups per minute, per visitor
    message: { error: 'Too many space lookups. Please wait a minute.' }
});
```

This time `message` is an object, so the limiter sends it as JSON, which your page already knows how to display.

**Step 2.** Add it to your route, between the path and the handler:

```js
app.get('/api/space', spaceLimiter, async (req, res) => {
```

**Step 3.** Test it by clicking "Show picture" 10 or more times quickly. (Loading the page already used one lookup.) Once you pass the limit, the next click should show your error message under the form. Check the Network tab: the response status is `429 Too Many Requests`.

**Think about it:** your cache and your limiter work together. Cached lookups do not use your NASA quota at all, and the limiter stops anyone from forcing thousands of new lookups.

## Part 8: Deploy with your key on Render

Your `.env` file is not on GitHub, so Render does not have your key yet. Without it, your live route will return a `500` error.

**Step 1.** In the Render dashboard, open your web service and find the **Environment** section.

**Step 2.** Add an environment variable:

- **Key:** `NASA_API_KEY`
- **Value:** your key

The name must match `process.env.NASA_API_KEY` exactly, including capital letters. Save it; Render will redeploy.

**Step 3.** Commit and push your code, including `.env.example`. Double-check with `git status` that `.env` is **not** included.

**Step 4.** Test `/space` on your live site. Look up a few dates, then open Render's **Logs** tab and find your `Asking NASA` and `Cache hit` messages.

**Step 5.** Final security check. On the live site, open the Network tab, look up a date, and search every request for your key. It should appear nowhere. Then check your GitHub repo in the browser and confirm there is no `.env` file.

## Testing checklist

- [ ] `.env` holds `NASA_API_KEY`, and `git status` never lists `.env`
- [ ] `.env.example` is committed with fake values
- [ ] `/api/space` returns one picture with `title`, `date`, `imageUrl`, `description` and `nasaPage`
- [ ] Clicking `imageUrl` opens the image itself, not a web page
- [ ] `/api/space?date=2025-07-04` returns that day's picture, or a `404` if NASA has none
- [ ] All five bad-date URLs from Part 4 return `400` without calling NASA
- [ ] `/space` shows a picture on load, and the date picker loads other days
- [ ] Images appear with no CSP errors in the Console
- [ ] The "Read the full story" link opens NASA's page
- [ ] Looking up the same date twice shows `Cache hit` in the terminal
- [ ] Clicking too fast shows the rate-limit message, with status `429`
- [ ] Your key appears nowhere in the Network tab, locally or on Render
- [ ] The live Render site works, with `NASA_API_KEY` set in Render's Environment settings

## Stretch goals

1. **Handle video days.** Some days are videos, and `hdurl` is missing. Add `mediaType: picture.media_type` to your server's response, and on the page hide the `<img>` and show a message when `mediaType` is not `"image"`.
2. **Random picture button.** NASA's `count` parameter (up to 25) returns that many random pictures. Add a "Surprise me" button that calls a new route, `/api/space/random`, which asks for `count=1`. Should random results be cached? Explain your answer.
3. **A recent-pictures gallery.** With no date, NASA already sends a list of recent pictures. Build a route that sends back all of them, reshaped with `.map()`, and a page that shows them as a grid.
4. **Show the explanation (challenge).** NASA's `explanation` contains HTML tags. Research how to remove tags from a string on the server, and why putting NASA's HTML straight into `innerHTML` would be risky even though NASA is trustworthy.
5. **Your own API.** Find another free API that needs a key, such as weather or movies, and build a second proxy route and page using the same pattern: key in `.env`, validation, reshaped data, cache, route limiter and CSP updates.
