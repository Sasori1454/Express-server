async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();
        document.querySelector('#stats').textContent = `Visitors: ${data.visitorCount} | Guestbook entries: ${data.guestbookCount}`;
    } catch (err) {
        document.querySelector('#stats').textContent = 'Could not load stats.';
    }
}

loadStats();
