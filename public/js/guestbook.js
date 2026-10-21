const listError = document.querySelector('#list-error');
const formError = document.querySelector('#form-error');

async function getCsrfToken() {
    const response = await fetch('/api/csrf-token');
    const data = await response.json();
    return data.csrfToken;
}

async function deleteEntry(id) {
    if (!confirm('Delete this message?')) return;

    try {
        const csrfToken = await getCsrfToken();
        const response = await fetch(`/api/guestbook/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { 'x-csrf-token': csrfToken }
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            listError.textContent = data.error || 'Could not delete that message.';
            return;
        }

        await loadMessages();
    } catch (err) {
        listError.textContent = 'Could not reach the server. Check your connection.';
    }
}

async function saveEdit(entry, newMsg) {
    try {
        const csrfToken = await getCsrfToken();
        const response = await fetch(`/api/guestbook/${encodeURIComponent(entry.id)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-csrf-token': csrfToken
            },
            body: JSON.stringify({ name: entry.name, msg: newMsg })
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            listError.textContent = data.error || 'Could not save your changes.';
            return;
        }

        await loadMessages();
    } catch (err) {
        listError.textContent = 'Could not reach the server. Check your connection.';
    }
}

function startEdit(li, entry) {
    li.textContent = '';

    const textarea = document.createElement('textarea');
    textarea.value = entry.msg;
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

async function loadMessages() {
    listError.textContent = '';

    try {
        const response = await fetch('/api/guestbook');
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            listError.textContent = data.error || 'Could not load messages.';
            return;
        }

        const list = document.querySelector('#guestbook-list');
        list.textContent = '';

        [...data].reverse().forEach((entry) => {
            const li = document.createElement('li');

            const name = document.createElement('strong');
            name.textContent = entry.name;

            const date = document.createElement('small');
            date.textContent = new Date(entry.createdAt).toLocaleString();

            const msg = document.createElement('p');
            msg.textContent = entry.msg;

            li.append(name, ' ', date, msg);

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

            li.append(' ', editButton, ' ', deleteButton);
            list.append(li);
        });
    } catch (err) {
        listError.textContent = 'Could not reach the server. Check your connection.';
    }
}

document.querySelector('#guestbook-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.textContent = '';

    try {
        const csrfToken = await getCsrfToken();
        const response = await fetch('/api/guestbook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-csrf-token': csrfToken
            },
            body: JSON.stringify({
                name: document.querySelector('#name').value,
                msg: document.querySelector('#msg').value
            })
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            formError.textContent = data.error || 'Something went wrong. Please try again.';
            return;
        }
    } catch (err) {
        formError.textContent = 'Could not reach the server. Check your connection.';
        return;
    }

    e.target.reset();
    loadMessages();
});

loadMessages();
