// A response can be lost after Redis has already counted a completed export.
// Keep its ID across same-tab reloads and reuse it until the server acknowledges it.
(() => {
    const key = "audio2tube.pendingConversions";
    const pending = new Map();
    const maxAge = 24 * 60 * 60 * 1000;
    try {
        for (const [id, time] of JSON.parse(sessionStorage.getItem(key) || "[]")) {
            if (Date.now() - time < maxAge) pending.set(id, time);
        }
    } catch { /* Storage may be disabled. The in-memory queue still works. */ }

    const count = document.getElementById("conversion-count");
    const sync = document.getElementById("count-sync");
    let highest = 0;
    let sending = false;
    let retry;
    let delay = 1000;

    function persist() {
        try { sessionStorage.setItem(key, JSON.stringify([...pending])); } catch {}
    }
    async function request(id) {
        const options = { cache: "no-store", signal: AbortSignal.timeout(12000) };
        if (id) Object.assign(options, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
        const response = await fetch("/api/conversions", options);
        if (!response.ok) throw new Error("Counter unavailable");
        const { conversions } = await response.json();
        if (!Number.isSafeInteger(conversions) || conversions < 0) throw new Error("Invalid count");
        highest = Math.max(highest, conversions);
        count.textContent = highest.toLocaleString();
        count.parentElement.hidden = false;
    }
    async function flush() {
        if (sending || !pending.size) return;
        sending = true;
        clearTimeout(retry);
        sync.textContent = "(syncing…)";
        try {
            for (const [id, time] of pending) {
                if (Date.now() - time < maxAge) await request(id);
                pending.delete(id);
                persist();
            }
            sync.textContent = "";
            delay = 1000;
        } catch {
            sync.textContent = "(waiting to sync)";
            retry = setTimeout(flush, delay);
            delay = Math.min(delay * 2, 60000);
        } finally {
            sending = false;
        }
    }
    window.recordConversion = () => {
        pending.set(crypto.randomUUID(), Date.now());
        persist();
        flush();
    };
    window.addEventListener("online", flush);
    request().catch(() => {});
    flush();
})();
