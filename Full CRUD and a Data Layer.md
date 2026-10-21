# Full CRUD and a Data Layer

Sep 27, 2026 · @Kevin

## Overview

By the end of this lesson, your guestbook will support all four basic data operations, and all of your file reading and writing will live in one module, `db.js`. When we switch to a PostgreSQL database later this year, `db.js` is the only file that will need to change.

**CRUD** stands for the four things almost every app does with data. Each one maps to an HTTP method:

| Operation | HTTP method | Route | Success status |
| --- | --- | --- | --- |
| **C**reate | `POST` | `/api/guestbook` | `201 Created` |
| **R**ead all | `GET` | `/api/guestbook` | `200 OK` |
| **R**ead one | `GET` | `/api/guestbook/:id` | `200 OK` |
| **U**pdate | `PUT` | `/api/guestbook/:id` | `200 OK` |
| **D**elete | `DELETE` | `/api/guestbook/:id` | `204 No Content` |

Notice the pattern: the **URL names the thing** ("the guestbook" or "entry 42 in the guestbook"), and the **method says what to do** with it. This style is called a **REST API**.

Files you will change: `server.js`, `public/js/guestbook.js`. New file: `db.js`.

## Before you start

1. **Finish the earlier lessons first.** You need the structured guestbook entries (with `id`, `name`, `msg` and `createdAt`), your error handler, and your guestbook script in `public/js/guestbook.js`.
2. **Commit your current work** with Git. Part 2 removes code from `server.js`, so a restore point matters.
3. **Post two or three guestbook messages** so you have data to edit and delete.

## Part 1: Build the data layer

Right now your routes read and write `guestbook.json` directly. That means **how** the data is stored is mixed in with **what** each route does. A **data layer** separates them: routes ask for data by name, like `db.getEntryById(id)`, and only `db.js` knows there is a JSON file underneath.

**Step 1.** Create `db.js` in your project's main folder, next to `server.js`:

```js
// db.js - the ONLY file that knows how guestbook data is stored
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const GUESTBOOK_FILE = path.join(__dirname, 'guestbook.json');
const MAX_ENTRIES = 50;

// ----- Private helpers (not exported) -----

async function readAll() {
    try {
        const text = await fs.readFile(GUESTBOOK_FILE, 'utf8');
        return JSON.parse(text);
    } catch (err) {
        if (err.code === 'ENOENT') return []; // file doesn't exist yet
        throw err; // anything else is a real problem for the error handler
    }
}

async function writeAll(entries) {
    await fs.writeFile(GUESTBOOK_FILE, JSON.stringify(entries, null, 2));
}

// ----- Public functions (exported) -----

async function getAllEntries() {
    return readAll();
}

async function getEntryById(id) {
    const entries = await readAll();
    return entries.find(entry => entry.id === id) || null;
}

async function addEntry({ name, msg }) {
    const entries = await readAll();
    const entry = {
        id: crypto.randomUUID(),
        name,
        msg,
        createdAt: new Date().toISOString()
    };
    entries.push(entry);
    await writeAll(entries.slice(-MAX_ENTRIES));
    return entry;
}

async function updateEntry(id, { name, msg }) {
    const entries = await readAll();
    const entry = entries.find(e => e.id === id);
    if (!entry) return null;

    entry.name = name;
    entry.msg = msg;
    entry.updatedAt = new Date().toISOString();
    await writeAll(entries);
    return entry;
}

async function deleteEntry(id) {
    const entries = await readAll();
    const remaining = entries.filter(e => e.id !== id);
    if (remaining.length === entries.length) return false; // nothing matched

    await writeAll(remaining);
    return true;
}

module.exports = { getAllEntries, getEntryById, addEntry, updateEntry, deleteEntry };
```

Key ideas:

- **`module.exports`** lists what other files are allowed to use. `readAll` and `writeAll` are **private**, so no route can touch the file directly, even by accident.
- **Every function is `async`.** Reading a file takes time, and so will a database query later. Making them `async` now means your routes will not need to change when we switch.
- **`fs/promises`** is the `async` version of `fs`. Instead of `readFileSync`, you `await fs.readFile(...)`, and the server can handle other visitors while it waits.
- **`ENOENT`** is Node's error code for "file not found." A missing file just means no one has posted yet, so we return an empty list. Any other error, like broken JSON, is passed on to your error handler.
- **Each function returns something useful:** the entry, `null` when nothing is found, or `true`/`false` for a delete. The routes use these to pick a status code.
- **The data layer creates the `id` and `createdAt`**, just like a database will.

## Part 2: Switch your existing routes to db.js

**Step 1.** At the top of `server.js`, with your other `require` lines, add:

```js
const db = require('./db');
```

The `./` means "a file in this same folder," not a package from npm.

**Step 2.** **Delete** these from `server.js`, because `db.js` handles them now:

- The `GUESTBOOK_FILE` constant
- The `getGuestbookMessages` function
- `const crypto = require('crypto');`, unless you use it somewhere else in `server.js`

Keep `validateEntry` in `server.js`. Checking what users send is the route's job, not the data layer's.

**Step 3.** Replace your GET and POST guestbook routes with these versions:

```js
// READ ALL
app.get('/api/guestbook', requireAuth, async (req, res) => {
    const entries = await db.getAllEntries();
    res.json(entries);
});

// CREATE
app.post('/api/guestbook', requireAuth, async (req, res) => {
    const { name, msg } = req.body;
    const error = validateEntry(name, msg);
    if (error) {
        return res.status(400).json({ error });
    }

    const entry = await db.addEntry({ name: name.trim(), msg: msg.trim() });
    res.status(201).json(entry);
});
```

Compare these to your old routes. They no longer mention files, `JSON.parse` or `slice(-50)`. Each route now reads like a short description of what it does.

`{ error }` is shorthand for `{ error: error }`. When a key and variable have the same name, you can write it once.

> **Did you add the bad-words filter?** (It was a stretch goal in the guestbook lesson.) Keep it: like validation, checking what users send is the route's job. Put your filter check right after the `validateEntry` check, before `db.addEntry`:
>
> ```js
> if (filter.isProfane(msg)) {
>     return res.status(400).json({ error: 'Please keep your message friendly.' });
> }
> ```
>
> Keep your `require('bad-words')` and `const filter = new Filter();` lines at the top of `server.js`. If you never added the filter, skip this box.

**Step 4.** Restart and test the guestbook page. Loading and posting should work **exactly** as before. This kind of change, where code gets reorganized but behaves the same, is called a **refactor**. Commit it before moving on.

## Part 3: Read one entry with a route parameter

A **route parameter** is a placeholder in the path, written with a colon. In `/api/guestbook/:id`, the `:id` part matches whatever is in that spot of the URL, and Express puts it in `req.params.id`.

| URL visited | `req.params.id` |
| --- | --- |
| `/api/guestbook/abc123` | `'abc123'` |
| `/api/guestbook/3b241101-e2bb-4255-8caf-4136c566a962` | `'3b241101-e2bb-4255-8caf-4136c566a962'` |

Compare this to `req.query` from the NASA lesson. Query strings (`?date=...`) are for optional filters and options; route parameters are for **which thing** you mean.

**Step 1.** Add this below your READ ALL route:

```js
// READ ONE
app.get('/api/guestbook/:id', requireAuth, async (req, res) => {
    const entry = await db.getEntryById(req.params.id);
    if (!entry) {
        return res.status(404).json({ error: 'Entry not found.' });
    }
    res.json(entry);
});
```

**Step 2.** Test it. Open `guestbook.json`, copy one entry's `id`, and visit `/api/guestbook/` followed by that ID. You should see just that one entry.

**Step 3.** Visit `/api/guestbook/not-a-real-id`. You should get your `404` JSON error. A `404` does not only mean "no such page"; it also means "no such **thing**."

## Part 4: Delete an entry

**Step 1.** Add the DELETE route:

```js
// DELETE
app.delete('/api/guestbook/:id', requireAuth, async (req, res) => {
    const deleted = await db.deleteEntry(req.params.id);
    if (!deleted) {
        return res.status(404).json({ error: 'Entry not found.' });
    }
    res.status(204).end();
});
```

**Status `204 No Content`** means "it worked, and there is nothing to send back." `res.end()` finishes the response with an empty body. There is no point sending the entry back, because it no longer exists.

**Step 2.** You cannot send a DELETE by typing a URL, so test from the browser Console while logged in. Put a real ID in place of `PASTE_ID_HERE`:

```js
fetch('/api/guestbook/PASTE_ID_HERE', { method: 'DELETE' })
    .then(r => console.log(r.status));
```

You should see `204`, and the entry should disappear from `guestbook.json`. Run the exact same code again: now you get `404`, because it is already gone.

## Part 5: Update an entry with PUT

Updating combines everything so far: a route parameter to pick the entry, a body with the new data, validation, and a `404` if the entry does not exist.

**Step 1.** Add the PUT route:

```js
// UPDATE
app.put('/api/guestbook/:id', requireAuth, async (req, res) => {
    const { name, msg } = req.body;
    const error = validateEntry(name, msg);
    if (error) {
        return res.status(400).json({ error });
    }

    const updated = await db.updateEntry(req.params.id, {
        name: name.trim(),
        msg: msg.trim()
    });
    if (!updated) {
        return res.status(404).json({ error: 'Entry not found.' });
    }
    res.json(updated);
});
```

Key ideas:

- **`PUT` replaces the whole entry**, so the request must send **both** `name` and `msg`, even if only one changed. That is why it reuses `validateEntry`.
- **Validate before looking up the entry.** A bad request gets a `400` without the server reading the file at all.
- **`id` and `createdAt` never change.** The data layer only updates `name` and `msg`, and adds an `updatedAt` timestamp.

> **Bad-words filter users:** add the same `filter.isProfane(msg)` check to this route, right after `validateEntry`. Otherwise someone could post a friendly message, then **edit** it into a rude one, and your filter would never see it. Every route that accepts user text needs the same checks.

**Step 2.** Test from the Console with a real ID:

```js
fetch('/api/guestbook/PASTE_ID_HERE', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Maya', msg: 'I edited this!' })
}).then(async r => console.log(r.status, await r.json()));
```

You should get `200` with the updated entry, including a new `updatedAt`. Then try an empty `msg` (expect `400`) and a fake ID (expect `404`).

## Part 6: Delete and edit buttons on the frontend

Now give each entry on the page its own Delete and Edit buttons. All of this goes in `public/js/guestbook.js`.

**Step 1.** Add these two functions to your script, above `loadMessages`:

```js
async function deleteEntry(id) {
    if (!confirm('Delete this message?')) return;
    const listError = document.querySelector('#list-error');

    try {
        const response = await fetch(`/api/guestbook/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            listError.textContent = data.error || 'Could not delete that message.';
            return;
        }
        loadMessages();
    } catch (err) {
        listError.textContent = 'Could not reach the server. Check your connection.';
    }
}

async function saveEdit(entry, newMsg) {
    const listError = document.querySelector('#list-error');

    try {
        const response = await fetch(`/api/guestbook/${encodeURIComponent(entry.id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: entry.name, msg: newMsg })
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            listError.textContent = data.error || 'Could not save your changes.';
            return;
        }
        loadMessages();
    } catch (err) {
        listError.textContent = 'Could not reach the server. Check your connection.';
    }
}
```

**Watch out:** a successful DELETE returns `204` with an **empty** body. Calling `response.json()` on it would throw an error, which is why `deleteEntry` only reads the body when something went wrong.

**Step 2.** Add a function that swaps an entry into edit mode:

```js
function startEdit(li, entry) {
    li.innerHTML = ''; // clearing with an empty string is safe

    const textarea = document.createElement('textarea');
    textarea.value = entry.msg; // .value is safe, like textContent
    textarea.maxLength = 280;

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.textContent = 'Save';
    saveButton.addEventListener('click', () => saveEdit(entry, textarea.value));

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', loadMessages);

    li.append(textarea, saveButton, cancelButton);
    textarea.focus();
}
```

**Step 3.** Inside `loadMessages`, find the loop where you build each `li`. Just before `list.append(li)`, add the buttons:

```js
if (entry.updatedAt) {
    const edited = document.createElement('small');
    edited.textContent = ' (edited)';
    li.append(edited);
}

const editButton = document.createElement('button');
editButton.type = 'button';
editButton.textContent = 'Edit';
editButton.addEventListener('click', () => startEdit(li, entry));

const deleteButton = document.createElement('button');
deleteButton.type = 'button';
deleteButton.textContent = 'Delete';
deleteButton.addEventListener('click', () => deleteEntry(entry.id));

li.append(editButton, deleteButton);
```

Key ideas:

- **Each button remembers its own entry.** The arrow function `() => deleteEntry(entry.id)` is created inside the loop, so each one holds on to the `entry` from that pass. This is called a **closure**.
- **No `onclick="..."` attributes.** Your Content-Security-Policy would block them. `addEventListener` works because the code lives in your script file.
- **`type="button"`** stops a button from accidentally submitting a form.
- **Cancel just calls `loadMessages()`,** which redraws the list from the server and throws away the unsaved edit.

**Step 4.** Test on the page: edit a message and save it, cancel an edit, delete a message, and cancel a delete from the confirm box.

## Part 7: Why the data layer matters

Here is a peek at the future. **You do not need to type this.** When we move to PostgreSQL, your `getEntryById` function in `db.js` will look something like this:

```js
// Future db.js, using a PostgreSQL database instead of a JSON file
async function getEntryById(id) {
    const result = await pool.query('SELECT * FROM entries WHERE id = $1', [id]);
    return result.rows[0] || null;
}
```

The inside is completely different, but the function still has the same name, takes the same `id`, is still `async`, and still returns the entry or `null`. So this route does not change **at all**:

```js
const entry = await db.getEntryById(req.params.id);
```

That is the payoff of a data layer: your routes describe **what** they need, and only `db.js` decides **how** to get it.

### Think about it

Log in, and delete a message that someone else posted. It works. Anyone with the shared password can edit or delete **every** message on the site.

Your server knows **that** someone is logged in, but not **who** they are. Fixing that means user accounts, each with their own username and password. That is coming in a later lesson.

## Testing checklist

- [ ] `server.js` no longer contains `GUESTBOOK_FILE`, `getGuestbookMessages`, `readFileSync` or `writeFileSync` for the guestbook
- [ ] Loading and posting on the guestbook page work exactly as before
- [ ] `/api/guestbook/<real id>` returns one entry; a fake ID returns `404`
- [ ] A DELETE from the Console returns `204`, and repeating it returns `404`
- [ ] A PUT returns `200` with `updatedAt`; an empty message returns `400`; a fake ID returns `404`
- [ ] Editing a message on the page saves it and shows "(edited)"
- [ ] Cancel exits edit mode without saving
- [ ] Deleting on the page asks for confirmation, then removes the message
- [ ] Deleting `guestbook.json` entirely still lets the page load an empty list
- [ ] A broken `guestbook.json` still reaches your error handler with a `500`
- [ ] No CSP errors appear in the Console
- [ ] If you have the bad-words filter: posting **and** editing a message with a blocked word both return `400`

## Stretch goals

1. **Search.** Support `/api/guestbook?search=hello`, returning only entries whose message contains that word. Should the filtering happen in the route or in `db.js`? Explain your choice.
2. **PATCH vs PUT.** Add a `PATCH /api/guestbook/:id` route that updates only the fields that are sent, so `{ "msg": "new text" }` alone is allowed. Research the difference between PUT and PATCH, and explain it in a comment.
3. **Sorting.** Support `?sort=newest` and `?sort=oldest`, and add a dropdown on the page to switch between them.
4. **Count endpoint.** Add `db.countEntries()` and include the number of guestbook entries in your `/api/stats` route.
5. **A second resource.** Move your projects page data into a `projects.json` file with full CRUD at `/api/projects`, using a new set of functions in `db.js`. Then render your projects page from `fetch` instead of hardcoded HTML.
