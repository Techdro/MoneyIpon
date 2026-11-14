import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import {
    getAuth, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword,
    signInWithEmailAndPassword, sendPasswordResetEmail, signOut, updateProfile, onAuthStateChanged,
    signInWithRedirect, getRedirectResult
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAXmD_UIOmRZfW9KAeV7YFVnqoXfXHTHoE",
    authDomain: "moneyipon-37200.firebaseapp.com",
    projectId: "moneyipon-37200",
    storageBucket: "moneyipon-37200.firebasestorage.app",
    messagingSenderId: "10776330537",
    appId: "1:10776330537:web:443d7d1e1af67b26007738",
    measurementId: "G-DZEG12C6KV"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const google = new GoogleAuthProvider();

/* ---------- Helpers ---------- */
const $ = id => document.getElementById(id);
const num = v => Number(v) || 0;
const money = (n, d = 2) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: d, maximumFractionDigits: d }).format(num(n));
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => ymd(new Date());

// Built-in logo so images always work (no file needed)
const LOGO = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#e78b43"/><circle cx="50" cy="50" r="31" fill="#fff"/><text x="50" y="64" font-size="40" font-weight="800" text-anchor="middle" fill="#594637" font-family="Arial,sans-serif">₱</text></svg>');
document.querySelectorAll(".logo-img").forEach(i => { i.src = LOGO; });
$("userPhoto").onerror = () => { $("userPhoto").src = LOGO; };

const EXP = ["Food", "Transportation", "Bills", "Education", "Shopping", "Health", "Entertainment", "Other"];
const INC = ["Salary", "Business", "Allowance", "Other"];
const COL = { Food: "#e78b43", Transportation: "#4f8fc0", Bills: "#8e6bb8", Education: "#c9a227", Shopping: "#d1608f", Health: "#4da58a", Entertainment: "#7fa82a", Other: "#8d887f" };
const KEYS = {
    Food: "jollibee mcdo rice ulam grocery palengke market coffee milk tea lunch dinner breakfast pizza snack carinderia merienda",
    Transportation: "grab jeep jeepney tricycle trike bus fare gas gasoline fuel angkas taxi parking toll",
    Bills: "meralco electric water wifi internet load globe smart pldt bill rent subscription netflix spotify",
    Education: "tuition school books printing project",
    Shopping: "shopee lazada clothes shoes mall shirt bag",
    Health: "medicine mercury pharmacy doctor clinic vitamins dental",
    Entertainment: "movie cinema game concert inuman beer videoke"
};
function guess(text) {
    const words = text.toLowerCase().split(/[^a-z]+/);
    for (const c in KEYS) { const k = KEYS[c].split(" "); if (words.some(w => w && k.includes(w))) return c; }
    return null;
}

/* ---------- State, storage, cloud sync ---------- */
const DEF = () => ({ tx: [], bud: [], goals: [], debts: [], cycle: "month", pro: false, updated: 0 });
let S = DEF(), user = null, view = new Date(), saveTimer, undoTimer;
const key = () => `moneyipon_v2_${user.uid}`;

function loadLocal() {
    try { const r = localStorage.getItem(key()); if (r) return { ...DEF(), ...JSON.parse(r) }; } catch { }
    const old = t => { try { return JSON.parse(localStorage.getItem(`moneyipon_${user.uid}_${t}`)) || []; } catch { return []; } };
    return { ...DEF(), tx: old("transactions"), bud: old("budgets"), goals: old("goals") };
}
function setSync(t) { $("syncStatus").textContent = t; }
function save() {
    S.updated = Date.now();
    try { localStorage.setItem(key(), JSON.stringify(S)); } catch { }
    setSync("Saving…");
    clearTimeout(saveTimer);
    const u = user;
    saveTimer = setTimeout(async () => {
        try { await setDoc(doc(db, "users", u.uid), JSON.parse(JSON.stringify(S))); setSync("Synced to your account."); }
        catch { setSync("Saved on this device. Cloud sync is unavailable right now."); }
    }, 800);
}

/* ---------- Periods ---------- */
function period() {
    const y = view.getFullYear(), m = view.getMonth(), d = view.getDate(), last = new Date(y, m + 1, 0).getDate();
    let a = 1, b = last;
    if (S.cycle === "half") { if (d <= 15) b = 15; else a = 16; }
    const mon = new Date(y, m, 1).toLocaleDateString("en-PH", { month: S.cycle === "half" ? "short" : "long" });
    return { start: ymd(new Date(y, m, a)), end: ymd(new Date(y, m, b)), label: S.cycle === "half" ? `${mon} ${a}–${b}, ${y}` : `${mon} ${y}` };
}
function shift(dir) {
    const y = view.getFullYear(), m = view.getMonth(), first = view.getDate() <= 15;
    if (S.cycle === "half") view = dir < 0 ? (first ? new Date(y, m - 1, 16) : new Date(y, m, 1)) : (first ? new Date(y, m, 16) : new Date(y, m + 1, 1));
    else view = new Date(y, m + dir, 1);
    renderAll();
}
function totals(p) {
    const tx = S.tx.filter(t => t.date >= p.start && t.date <= p.end);
    const sum = ty => tx.filter(t => t.type === ty).reduce((s, t) => s + num(t.amount), 0);
    return { tx, income: sum("income"), spent: sum("expense"), saved: sum("saving") };
}
const sorted = () => [...S.tx].sort((a, b) => b.date.localeCompare(a.date));
const spentBy = (p, cat) => totals(p).tx.filter(t => t.type === "expense" && t.category === cat).reduce((s, t) => s + num(t.amount), 0);

/* ---------- Toast ---------- */
function toast(msg, undo) {
    const t = $("toast");
    t.innerHTML = esc(msg) + (undo ? ' <button id="undoBtn">Undo</button>' : "");
    t.classList.add("show");
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => t.classList.remove("show"), 5000);
    if (undo) $("undoBtn").onclick = () => { undo(); t.classList.remove("show"); };
}

/* ---------- Auth ---------- */
let authMode = "login";
function showMessage(m, ok) { $("authMessage").textContent = m; $("authMessage").style.color = ok ? "#4f7a58" : "#c04c3f"; }
function friendly(e) {
    const c = e.code || "";
    if (/invalid-credential|user-not-found|wrong-password/.test(c)) return "Incorrect email or password. If you signed up with Google, use Continue with Google.";
    if (c.includes("invalid-email")) return "That email address doesn’t look right.";
    if (c.includes("email-already-in-use")) return "That email already has an account. Try logging in.";
    if (c.includes("weak-password")) return "Use at least 6 characters for your password.";
    if (c.includes("network")) return "No internet connection. Please try again.";
    if (c.includes("popup-closed") || c.includes("cancelled-popup")) return "";
    if (c.includes("too-many-requests")) return "Too many attempts. Please wait a few minutes and try again.";
    if (c.includes("operation-not-allowed")) return "This sign-in method isn’t turned on yet. In Firebase Console, open Authentication, then Sign-in method, and enable it.";
    if (c.includes("unauthorized-domain")) return "This website address isn’t approved in Firebase. Add it under Authentication, Settings, Authorized domains.";
    if (c.includes("operation-not-supported")) return "Sign-in doesn’t work when the file is opened directly. Use your hosted website link.";
    if (!e.code && e.message) return e.message;
    return `Something went wrong (${c || "unknown"}). Please try again.`;
}
function setAuthMode(mode) {
    authMode = mode;
    $("loginTab").classList.toggle("active", mode === "login");
    $("signupTab").classList.toggle("active", mode === "signup");
    document.querySelectorAll(".signup-only").forEach(el => { el.classList.toggle("hidden", mode !== "signup"); el.required = mode === "signup"; });
    $("authSubmit").textContent = mode === "login" ? "Login" : "Create account";
    $("passwordInput").autocomplete = mode === "login" ? "current-password" : "new-password";
    showMessage("");
}
$("loginTab").onclick = () => setAuthMode("login");
$("signupTab").onclick = () => setAuthMode("signup");

$("authForm").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("emailInput").value.trim(), password = $("passwordInput").value, name = $("nameInput").value.trim();
    try {
        $("authSubmit").disabled = true; showMessage("Please wait…", true);
        if (authMode === "signup") {
            if (!name) throw new Error("Please enter your full name.");
            const r = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(r.user, { displayName: name });
            paintUser(r.user);
        } else await signInWithEmailAndPassword(auth, email, password);
        showMessage("");
    } catch (err) { showMessage(friendly(err)); }
    finally { $("authSubmit").disabled = false; }
});

$("forgotBtn").onclick = async () => {
    const email = $("emailInput").value.trim();
    if (!email) return showMessage("Type your email address above first, then tap Forgot password.");
    $("forgotBtn").disabled = true; showMessage("Sending reset link…", true);
    try {
        await sendPasswordResetEmail(auth, email);
        showMessage("If an account exists for that email, a reset link is on its way. Check your spam folder too. If you signed up with Google, use Continue with Google instead.", true);
    } catch (err) { showMessage(friendly(err)); }
    finally { $("forgotBtn").disabled = false; }
};

$("googleBtn").onclick = async () => {
    try { await signInWithPopup(auth, google); }
    catch (err) {
        if ((err.code || "").includes("popup-blocked")) { try { await signInWithRedirect(auth, google); return; } catch (e2) { err = e2; } }
        showMessage(friendly(err));
    }
};
getRedirectResult(auth).catch(err => showMessage(friendly(err)));
document.querySelectorAll(".js-logout").forEach(b => b.onclick = () => signOut(auth).catch(() => toast("Could not log out. Try again.")));

/* ---------- Splash + auth state ---------- */
const t0 = performance.now();
function hideSplash() {
    const s = $("splash"); if (!s) return;
    setTimeout(() => { s.classList.add("out"); s.dataset.done = 1; setTimeout(() => s.remove(), 500); }, Math.max(0, 500 - (performance.now() - t0)));
}
function paintUser(u) {
    $("userName").textContent = u.displayName || u.email || "User";
    $("welcomeText").textContent = `Welcome back, ${(u.displayName || "friend").split(" ")[0]}!`;
    $("userPhoto").src = u.photoURL || LOGO;
    $("settingsEmail").textContent = u.email || "Not available";
    $("settingsProvider").textContent = u.providerData.map(p => p.providerId.replace(".com", "")).join(", ") || "email";
}
// Cloud sync runs in the background so it never blocks the app
async function syncFromCloud(u) {
    try {
        const d = await Promise.race([getDoc(doc(db, "users", u.uid)), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 6000))]);
        if (user !== u) return;
        if (d.exists()) {
            const c = d.data();
            if (num(c.updated) > num(S.updated)) {
                S = { ...DEF(), ...c };
                try { localStorage.setItem(key(), JSON.stringify(S)); } catch { }
                $("cycleSelect").value = S.cycle; renderAll();
            } else if (num(S.updated) > num(c.updated)) save();
        } else if (S.tx.length || S.bud.length || S.goals.length) save();
        setSync("Synced to your account.");
    } catch { setSync("Saved on this device. Cloud sync isn’t available yet. Check that Firestore is enabled in Firebase."); }
}
onAuthStateChanged(auth, u => {
    user = u;
    if (!u) { $("authScreen").classList.remove("hidden"); $("appScreen").classList.add("hidden"); hideSplash(); return; }
    try {
        S = loadLocal(); view = new Date();
        $("authScreen").classList.add("hidden"); $("appScreen").classList.remove("hidden");
        paintUser(u); $("cycleSelect").value = S.cycle; $("transactionDate").value = today();
        fillCats(); setSync("Syncing…"); navigate("overview");
    } catch (err) { console.error(err); }
    hideSplash();
    syncFromCloud(u);
});

/* ---------- Navigation ---------- */
const TITLES = { pro: "MoneyIpon Pro", overview: "Home", transactions: "Activity", budgets: "Budgets", goals: "Alkansya Goals", utang: "Utang", reports: "Reports", settings: "Settings", about: "About & Credits" };
function navigate(page) {
    document.querySelectorAll(".page").forEach(s => s.classList.add("hidden"));
    $(page).classList.remove("hidden");
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.page === page));
    $("pageTitle").textContent = TITLES[page];
    $("periodBar").classList.toggle("hidden", !["overview", "budgets", "reports"].includes(page));
    window.scrollTo(0, 0);
    renderAll();
}
document.querySelectorAll(".nav-btn").forEach(b => b.onclick = () => navigate(b.dataset.page));

/* ---------- Click actions (delegated) ---------- */
document.addEventListener("click", e => {
    const g = e.target.closest("[data-goto]"); if (g) return navigate(g.dataset.goto);
    const b = e.target.closest("[data-act]"); if (!b || !user) return;
    const id = b.dataset.id;
    switch (b.dataset.act) {
        case "shift": shift(Number(b.dataset.dir)); break;
        case "chip": $("transactionAmount").value = (num($("transactionAmount").value) + Number(b.dataset.v)).toFixed(2).replace(/\.00$/, ""); break;
        case "delTx": delTx(id); break;
        case "delBud": S.bud = S.bud.filter(x => x.id !== id); save(); renderAll(); break;
        case "delGoal": if (confirm("Delete this goal? Your savings records stay in Activity.")) { S.goals = S.goals.filter(x => x.id !== id); save(); renderAll(); } break;
        case "addSave": addSavings(id); break;
        case "payDebt": { const d = S.debts.find(x => x.id === id); if (d) d.paid = true; save(); renderAll(); break; }
        case "delDebt": S.debts = S.debts.filter(x => x.id !== id); save(); renderAll(); break;
    }
});

/* ---------- Transactions ---------- */
function fillCats() {
    $("transactionCategory").innerHTML = ($("transactionType").value === "income" ? INC : EXP).map(c => `<option>${c}</option>`).join("");
    $("budgetCategory").innerHTML = EXP.map(c => `<option>${c}</option>`).join("");
}
let catTouched = false;
$("transactionCategory").onchange = () => { catTouched = true; };
$("transactionType").onchange = () => { fillCats(); catTouched = false; $("catHint").textContent = ""; };
$("transactionTitle").oninput = e => {
    if ($("transactionType").value !== "expense") return;
    const c = guess(e.target.value);
    $("catHint").textContent = c ? `Auto-categorized as ${c}. You can change it.` : "";
    if (c && !catTouched) $("transactionCategory").value = c;
};
$("transactionForm").addEventListener("submit", e => {
    e.preventDefault(); if (!user) return;
    S.tx.push({ id: uid(), title: $("transactionTitle").value.trim(), amount: num($("transactionAmount").value), type: $("transactionType").value, category: $("transactionCategory").value, date: $("transactionDate").value });
    save(); e.target.reset(); fillCats(); catTouched = false; $("catHint").textContent = "";
    $("transactionDate").value = today(); toast("Transaction added"); renderAll();
});
function delTx(id) {
    const i = S.tx.findIndex(t => t.id === id); if (i < 0) return;
    const [t] = S.tx.splice(i, 1);
    const g = t.goalId && S.goals.find(x => x.id === t.goalId);
    if (g) g.saved = Math.max(0, g.saved - t.amount);
    save(); renderAll();
    toast("Transaction deleted", () => { S.tx.splice(i, 0, t); if (g) g.saved = Math.min(g.target, g.saved + t.amount); save(); renderAll(); });
}
$("transactionSearch").oninput = renderTransactions;

function txRow(t, canDelete) {
    const cls = t.type === "income" ? "income-text" : t.type === "saving" ? "saving-text" : "expense-text";
    const sign = t.type === "income" ? "+" : "−";
    return `<div class="data-row"><div><strong>${esc(t.title)}</strong><small>${esc(t.category)} • ${esc(t.date)}</small></div>
    <div class="acts"><span class="${cls}">${sign}${money(t.amount)}</span>${canDelete ? `<button class="delete-btn" data-act="delTx" data-id="${esc(t.id)}" aria-label="Delete transaction">✕</button>` : ""}</div></div>`;
}
function renderTransactions() {
    const q = ($("transactionSearch").value || "").toLowerCase();
    const list = sorted().filter(t => String(t.title || "").toLowerCase().includes(q) || String(t.category || "").toLowerCase().includes(q));
    $("transactionList").innerHTML = list.map(t => txRow(t, true)).join("") || '<p class="empty">No transactions yet. Add your first one above.</p>';
}

/* ---------- Budgets ---------- */
$("budgetForm").addEventListener("submit", e => {
    e.preventDefault();
    const category = $("budgetCategory").value, amount = num($("budgetAmount").value), ex = S.bud.find(b => b.category === category);
    if (ex) ex.amount = amount; else S.bud.push({ id: uid(), category, amount });
    save(); e.target.reset(); renderAll(); toast("Budget saved");
});
function renderBudgets() {
    const p = period();
    $("budgetList").innerHTML = S.bud.map(b => {
        const spent = spentBy(p, b.category), raw = b.amount > 0 ? spent / b.amount * 100 : 0, over = spent > b.amount;
        return `<div class="data-row"><div style="width:100%"><strong>${esc(b.category)}</strong>
        <small>${money(spent)} spent of ${money(b.amount)}</small>
        <div class="progress-track"><div class="progress-fill ${over ? "over" : raw >= 80 ? "warn" : ""}" style="width:${Math.min(raw, 100)}%"></div></div>
        <small class="${over ? "over-text" : ""}">${over ? money(spent - b.amount) + " over budget" : money(b.amount - spent) + " left (" + raw.toFixed(0) + "% used)"}</small></div>
        <button class="delete-btn" data-act="delBud" data-id="${esc(b.id)}" aria-label="Delete budget">✕</button></div>`;
    }).join("") || '<p class="empty">No budgets yet. Set one above to see how much you can spend each day.</p>';
}

/* ---------- Goals (alkansya) ---------- */
$("goalForm").addEventListener("submit", e => {
    e.preventDefault();
    const target = num($("goalTarget").value), saved = num($("goalSaved").value);
    if (saved > target) return toast("Starting savings can’t be more than the target.");
    S.goals.push({ id: uid(), name: $("goalName").value.trim(), target, saved, date: $("goalDate").value });
    save(); e.target.reset(); $("goalSaved").value = 0; renderAll(); toast("Goal created");
});
function addSavings(id) {
    const g = S.goals.find(x => x.id === id), inp = $("sv-" + id); if (!g || !inp) return;
    const amt = Math.min(num(inp.value), g.target - g.saved);
    if (amt <= 0) return toast(g.saved >= g.target ? "This goal is already complete." : "Enter an amount to save.");
    g.saved += amt;
    S.tx.push({ id: uid(), title: "Saved for " + g.name, amount: amt, type: "saving", category: "Savings", date: today(), goalId: g.id });
    save(); renderAll(); toast(g.saved >= g.target ? `Goal reached: ${g.name}! 🎉` : `${money(amt)} added to your alkansya`);
}
function renderGoals() {
    $("goalList").innerHTML = S.goals.map(g => {
        const pct = g.target > 0 ? Math.min(g.saved / g.target * 100, 100) : 0;
        return `<div class="data-row"><div style="width:100%"><strong>${esc(g.name)}</strong>
        <small>${money(g.saved)} of ${money(g.target)}${g.date ? " • Target " + esc(g.date) : ""}</small>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <small>${pct.toFixed(1)}% complete</small>
        ${pct < 100 ? `<div class="goal-add"><input id="sv-${esc(g.id)}" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="Amount (₱)" aria-label="Amount to save"><button class="small-btn" data-act="addSave" data-id="${esc(g.id)}">Add savings</button></div>` : ""}</div>
        <button class="delete-btn" data-act="delGoal" data-id="${esc(g.id)}" aria-label="Delete goal">✕</button></div>`;
    }).join("") || '<p class="empty">No goals yet. Start with an emergency fund.</p>';
}

/* ---------- Utang ---------- */
$("debtForm").addEventListener("submit", e => {
    e.preventDefault();
    S.debts.unshift({ id: uid(), person: $("debtPerson").value.trim(), amount: num($("debtAmount").value), dir: $("debtDir").value, note: $("debtNote").value.trim(), paid: false });
    save(); e.target.reset(); renderAll(); toast("Utang added");
});
function renderDebts() {
    const open = S.debts.filter(d => !d.paid), sum = dir => open.filter(d => d.dir === dir).reduce((s, d) => s + d.amount, 0);
    $("debtSummary").innerHTML = `<div class="data-row"><span>Owed to you</span><strong class="income-text">${money(sum("toMe"))}</strong></div><div class="data-row"><span>You owe</span><strong class="expense-text">${money(sum("iOwe"))}</strong></div>`;
    $("debtList").innerHTML = S.debts.map(d => `<div class="data-row${d.paid ? " done" : ""}"><div><strong>${esc(d.person)}</strong><small>${d.dir === "toMe" ? "owes you" : "you owe"} ${money(d.amount)}${d.note ? " • " + esc(d.note) : ""}${d.paid ? " • Paid" : ""}</small></div>
    <div class="acts">${d.paid ? "" : `<button class="small-btn" data-act="payDebt" data-id="${esc(d.id)}">Mark paid</button>`}<button class="delete-btn" data-act="delDebt" data-id="${esc(d.id)}" aria-label="Delete">✕</button></div></div>`).join("") || '<p class="empty">No utang recorded. All clear!</p>';
}

/* ---------- Overview ---------- */
function jarSVG(p) {
    const h = 85 * p;
    return `<svg viewBox="0 0 100 120" role="img" aria-label="Alkansya ${Math.round(p * 100)} percent full"><defs><clipPath id="jc"><rect x="15" y="25" width="70" height="85" rx="14"/></clipPath></defs>
    <rect x="15" y="25" width="70" height="85" rx="14" fill="#fff" stroke="#e78b43" stroke-width="4"/>
    <rect clip-path="url(#jc)" x="15" y="${110 - h}" width="70" height="${h}" fill="#e78b43"/>
    <rect x="28" y="10" width="44" height="12" rx="5" fill="#594637"/>
    <text x="50" y="73" text-anchor="middle" font-size="17" font-weight="800" fill="#302b25" stroke="#fff" stroke-width="3" paint-order="stroke" font-family="Arial,sans-serif">${Math.round(p * 100)}%</text></svg>`;
}
function renderOverview() {
    const p = period(), T = totals(p);
    $("periodLabel").textContent = p.label;
    const all = S.tx.reduce((s, t) => s + (t.type === "income" ? num(t.amount) : -num(t.amount)), 0);
    $("balance").textContent = money(all); $("income").textContent = money(T.income);
    $("expenses").textContent = money(T.spent); $("totalSavings").textContent = money(T.saved);

    const budget = S.bud.reduce((s, b) => s + num(b.amount), 0), left = budget - T.spent;
    const t = today(), isNow = t >= p.start && t <= p.end;
    const daysLeft = Math.round((new Date(p.end + "T00:00") - new Date(t + "T00:00")) / 864e5) + 1;
    const usedPct = budget > 0 ? T.spent / budget * 100 : 0;
    if (!budget) {
        $("safeLabel").textContent = "Safe to spend today"; $("safeValue").textContent = "—";
        $("safeSub").textContent = "Set your budgets to see your daily limit."; $("nudge").textContent = "Tip: start with Food, Transportation and Bills.";
    } else {
        $("safeLabel").textContent = isNow ? "Safe to spend today" : "Left in this period";
        $("safeValue").textContent = money(isNow ? Math.max(0, left / daysLeft) : left, 0);
        $("safeSub").textContent = isNow ? `${money(Math.max(0, left), 0)} left for ${daysLeft} more day${daysLeft > 1 ? "s" : ""}` : `Budget ${money(budget, 0)}, spent ${money(T.spent, 0)}`;
        $("nudge").textContent = left < 0 ? `You’re ${money(-left, 0)} over budget. Pause non-essentials until the next period.`
            : usedPct >= 80 ? `You’ve used ${usedPct.toFixed(0)}% of your budget. Slow down a little.` : "You’re on track. Keep it up!";
    }
    const tt = S.goals.reduce((s, g) => s + g.target, 0), ts = S.goals.reduce((s, g) => s + g.saved, 0), pr = tt > 0 ? Math.min(ts / tt, 1) : 0;
    $("jar").innerHTML = jarSVG(pr);
    $("jarText").textContent = tt > 0 ? `${money(ts, 0)} saved of ${money(tt, 0)} across ${S.goals.length} goal${S.goals.length > 1 ? "s" : ""}.` : "Create a goal to start filling your alkansya.";
    $("recentTransactions").innerHTML = sorted().slice(0, 5).map(x => txRow(x, false)).join("") || '<p class="empty">No activity yet. Add your first transaction.</p>';
}

/* ---------- Share card ---------- */
$("shareBtn").onclick = async () => {
    const ts = S.goals.reduce((s, g) => s + g.saved, 0), tt = S.goals.reduce((s, g) => s + g.target, 0), pr = tt > 0 ? ts / tt : 0;
    const c = document.createElement("canvas"); c.width = c.height = 1080; const x = c.getContext("2d");
    x.fillStyle = "#f8f5ed"; x.fillRect(0, 0, 1080, 1080);
    x.fillStyle = "#e78b43"; x.fillRect(0, 0, 1080, 300);
    x.textAlign = "center"; x.fillStyle = "#fff"; x.font = "800 80px Arial"; x.fillText("My Ipon", 540, 150);
    x.font = "500 36px Arial"; x.fillText(user.displayName || "MoneyIpon user", 540, 220);
    let fs = 160, txt = money(ts, 0); x.fillStyle = "#594637"; x.font = `800 ${fs}px Arial`;
    while (x.measureText(txt).width > 900 && fs > 40) { fs -= 6; x.font = `800 ${fs}px Arial`; }
    x.fillText(txt, 540, 560);
    x.font = "500 42px Arial"; x.fillStyle = "#6f6a61"; x.fillText(tt > 0 ? `saved toward my goals (${Math.round(pr * 100)}%)` : "my savings journey starts here", 540, 630);
    x.fillStyle = "#eeeae2"; x.fillRect(140, 700, 800, 36); x.fillStyle = "#e78b43"; x.fillRect(140, 700, 800 * Math.min(pr, 1), 36);
    x.fillStyle = "#594637"; x.font = "700 40px Arial"; x.fillText("Tracked with MoneyIpon", 540, 960);
    const blob = await new Promise(r => c.toBlob(r, "image/png")), file = new File([blob], "my-ipon.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: "My Ipon" }); } catch { } return; }
    download("my-ipon.png", blob);
};

/* ---------- Reports + export ---------- */
function renderReports() {
    const p = period(), T = totals(p);
    $("reportIncome").textContent = money(T.income); $("reportExpenses").textContent = money(T.spent); $("reportNet").textContent = money(T.income - T.spent);
    const cats = {}; T.tx.filter(t => t.type === "expense").forEach(t => { cats[t.category] = (cats[t.category] || 0) + num(t.amount); });
    $("expenseBreakdown").innerHTML = Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, a]) => {
        const pc = T.spent > 0 ? a / T.spent * 100 : 0;
        return `<div class="data-row"><div style="width:100%"><div style="display:flex;justify-content:space-between"><span>${esc(c)}</span><strong>${money(a)}</strong></div>
        <div class="progress-track"><div class="progress-fill" style="width:${pc}%;background:${COL[c] || "#8d887f"}"></div></div><small>${pc.toFixed(0)}% of spending</small></div></div>`;
    }).join("") || '<p class="empty">No expenses in this period.</p>';
}
function download(name, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("csvBtn").onclick = () => {
    const safe = v => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
    const rows = [["Description", "Amount", "Type", "Category", "Date"], ...sorted().map(t => [t.title, t.amount, t.type, t.category, t.date])];
    download("moneyipon-transactions.csv", rows.map(r => r.map(safe).join(",")).join("\n"), "text/csv");
};
$("jsonBtn").onclick = () => download("moneyipon-backup.json", JSON.stringify({ ...S, exportedAt: new Date().toISOString() }, null, 2), "application/json");

/* ---------- Settings ---------- */
$("cycleSelect").onchange = e => { S.cycle = e.target.value; view = new Date(); save(); renderAll(); toast("Budget period updated"); };
$("clearDataBtn").onclick = () => {
    if (!confirm("Clear all transactions, budgets, goals and utang? This also removes your synced copy.")) return;
    const c = S.cycle; S = DEF(); S.cycle = c; save(); renderAll(); toast("Financial data cleared");
};
let deferred;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; $("installBtn").classList.remove("hidden"); $("installHint").classList.add("hidden"); });
$("installBtn").onclick = async () => { if (!deferred) return; deferred.prompt(); deferred = null; $("installBtn").classList.add("hidden"); };

/* ---------- Render all + service worker ---------- */
$("proBtn").onclick = () => { S.pro = true; save(); renderPro(); toast("You’re on the list. Thanks!"); };
function renderPro() { $("proBtn").textContent = S.pro ? "You’re on the list ✓" : "Notify me when Pro launches"; $("proBtn").disabled = !!S.pro; }
function renderAll() {
    if (!user) return;
    [renderOverview, renderTransactions, renderBudgets, renderGoals, renderDebts, renderReports, renderPro].forEach(f => { try { f(); } catch (e) { console.error(e); } });
}
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => { }));