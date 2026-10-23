# Who Can Edit What

Oct 18, 2026 · @Kevin

## Overview

Right now, anyone logged in can edit or delete **every** guestbook message. By the end of this lesson, people can only change their own messages, and the admin can change any of them.

There are two different security questions:

| Question | Name | Failed answer |
| --- | --- | --- |
| **Who are you?** | Authentication | `401 Unauthorized`: log in first |
| **Are you allowed to do this?** | Authorization | `403 Forbidden`: you are logged in, but not allowed |

The User Accounts lesson answered the first question. This lesson answers the second. Every app that has accounts needs both: a store, for example, must make sure you can only see **your own** orders.

Files you will change: `db.js`, `server.js`, `guestbook.html`, `public/js/guestbook.js`.

## Before you start

1. **Finish User Accounts and Password Hashing.** Logging in must set `req.session.userId`, `username` and `role`.
2. **Your guestbook needs its Edit and Delete buttons** from the CRUD lesson.
3. **Commit your work** with Git.
4. **Create a second regular account** on your site, so you can test as two different people.

## Part 1: Remember who wrote each message

To check who may change a message, each one must store its author's ID.

**Step 1.** In `db.js`, update `addEntry` to save an `authorId`:

```js
async function addEntry({ name, msg, authorId }) {
    const entries = await readAll();
    const entry = {
        id: crypto.randomUUID(),
        name,
        msg,
        authorId,
        createdAt: new Date().toISOString()
    };
    entries.push(entry);
    await writeAll(entries.slice(-MAX_ENTRIES));
    return entry;
}
```

**Step 2.** In `server.js`, update your POST guestbook route. The server already knows who is posting, so the name now comes from the session instead of the form:

```js
app.post('/api/guestbook', requireAuth, async (req, res) => {
    const { msg } = req.body;
    const name = req.session.username;

    const error = validateEntry(name, msg);
    if (error) {
        return res.status(400).json({ error });
    }

    // Keep your bad-words check here, if you have one

    const entry = await db.addEntry({
        name,
        msg: msg.trim(),
        authorId: req.session.userId
    });
    res.status(201).json(entry);
});
```

If the name came from the form, anyone could post as `"admin"`. Taking it from the session means the name is always the real author.

> Messages posted before this lesson have no `authorId`. Only the admin will be able to edit or delete them.

## Part 2: Only authors (or the admin) can edit or delete

**Step 1.** Add a helper near your guards that answers "may this person change this entry?":

```js
function canModify(req, entry) {
    return entry.authorId === req.session.userId || req.session.role === 'admin';
}
```

**Step 2.** Update your DELETE route. It now **looks up the entry first**, because you cannot check who wrote something without finding it:

```js
app.delete('/api/guestbook/:id', requireAuth, async (req, res) => {
    const entry = await db.getEntryById(req.params.id);
    if (!entry) {
        return res.status(404).json({ error: 'Entry not found.' });
    }
    if (!canModify(req, entry)) {
        return res.status(403).json({ error: 'You can only delete your own messages.' });
    }

    await db.deleteEntry(entry.id);
    res.status(204).end();
});
```

**Step 3.** Update your PUT route the same way. Only the message can change; the author's name stays the same:

```js
app.put('/api/guestbook/:id', requireAuth, async (req, res) => {
    const { msg } = req.body;
    const entry = await db.getEntryById(req.params.id);
    if (!entry) {
        return res.status(404).json({ error: 'Entry not found.' });
    }
    if (!canModify(req, entry)) {
        return res.status(403).json({ error: 'You can only edit your own messages.' });
    }

    const error = validateEntry(entry.name, msg);
    if (error) {
        return res.status(400).json({ error });
    }

    // Keep your bad-words check here too, if you have one

    const updated = await db.updateEntry(entry.id, { name: entry.name, msg: msg.trim() });
    res.json(updated);
});
```

**Step 4.** Test from the Console. Log in as your second account, copy the ID of a message posted by your **first** account from `guestbook.json`, and run:

```js
const csrfToken = (await (await fetch('/api/csrf-token')).json()).csrfToken;
fetch('/api/guestbook/PASTE_ID_HERE', {
    method: 'DELETE',
    headers: { 'x-csrf-token': csrfToken }
})
    .then(r => console.log(r.status));
```

You should see `403`, and the message should still be in `guestbook.json`. Log in as the admin and run it again: this time you get `204`, and the message is gone.

To test editing, use the same `csrfToken` and run:

```js
fetch('/api/guestbook/PASTE_ID_HERE', {
    method: 'PUT',
    headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken
    },
    body: JSON.stringify({ msg: 'A replacement message' })
})
    .then(r => console.log(r.status));
```

## Part 3: Show buttons only on your own messages

**Step 1.** In `guestbook.html`, delete the **name** label and input from the form. The server fills in the name now.

**Step 2.** In `public/js/guestbook.js`, update the POST `body` in your submit handler to send only the message:

```js
body: JSON.stringify({ msg: document.querySelector('#msg').value })
```

**Step 3.** The page needs to know who is looking at it. At the top of the script, add:

```js
let currentUser = null;
```

Then, inside `loadMessages`, in the `try` block **before** the list is drawn, load the current user once:

```js
if (!currentUser) {
    currentUser = await (await fetch('/api/whoami')).json();
}
```

**Step 4.** In your loop, wrap the code that creates the Edit and Delete buttons in a check:

```js
const canEdit = entry.authorId === currentUser.userId || currentUser.role === 'admin';
if (canEdit) {
    // ...your existing code that creates and appends the Edit and Delete buttons...
}
```

It uses the same rule as `canModify` on the server.

**Hiding buttons is not security.** Anyone can still send a DELETE from the Console, like you did in Part 2. The `403` on the server is what actually protects each message. Hiding the buttons just keeps the page tidy, the same way frontend validation is a convenience and server validation is the real check.

## Testing checklist

Use a normal window and a private window, logged in as two different users.

- [ ] New messages show the author's username automatically, with no name box on the form
- [ ] `guestbook.json` entries include an `authorId`
- [ ] Each user sees Edit and Delete only on their own messages
- [ ] The admin sees Edit and Delete on every message
- [ ] A DELETE sent from the Console for someone else's message returns `403`
- [ ] A PUT sent from the Console for someone else's message returns `403`
- [ ] Editing your own message still works and shows "(edited)"
- [ ] Logged out, every `/api/guestbook` route still returns `401`

## Stretch goals

1. **"My messages" filter.** Add `/api/guestbook?mine=true`, which returns only the logged-in user's entries, and a checkbox on the page to switch it on.
2. **Admin badge.** Show an "(admin)" label next to messages written by the admin. What would you need to store with each entry to make this work?
3. **Delete my account.** Add a route that deletes the logged-in user's account. Decide what should happen to their messages, and explain your choice in a comment.

## Submit

Push your code, run the testing checklist on your live Render site, and send your teacher the Render URL.

## Grading rubric (10 points)

| Criterion | Points | Full credit | Partial credit |
| --- | --- | --- | --- |
| **Author saved** | 2 | New entries store `authorId`, and the name comes from the session, not the form | 1 pt: `authorId` saved but the name still comes from the form |
| **Ownership check** | 3 | DELETE and PUT both look up the entry and return `403` for someone else's message | 2 pts: only one route is protected |
| **Admin override** | 1 | The admin can edit and delete any message | — |
| **Frontend** | 2 | Name box removed; buttons shown only where `canEdit` is true | 1 pt: one of the two missing |
| **Testing** | 1 | Student can demonstrate a `403` from the Console | — |
| **Deployment** | 1 | Works on the live Render site | — |
| **Total** | **10** |  |  |

> **Grading tip:** on the student's live site, register a fresh account in a private window, then try deleting one of the student's own messages from the Console. It should return `403`.
