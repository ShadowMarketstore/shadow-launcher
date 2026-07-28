const container = document.getElementById('product-list-container');
const btnLaunch = document.getElementById('btn-launch');
const btnRestart = document.getElementById('btn-restart');
const btnFolder = document.getElementById('btn-folder');
const searchInput = document.getElementById('search-input');
const terminal = document.getElementById('terminal-log');

// Cache des produits scannés + sélection persistante indépendante du filtre
let allProduits = [];
const selection = new Set();

// Dégradés pour les badges générés (identité Shadow, pas de logo officiel)
const badgePalette = [
    ['#6d28d9', '#00e5ff'],
    ['#9d174d', '#9d7fff'],
    ['#1e3a8a', '#00e5ff'],
    ['#5b21b6', '#22d3ee'],
    ['#7c2d92', '#38bdf8']
];

function getInitials(name) {
    const words = name.split(' ').filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

function normalize(str) {
    return str
        .replace(/^shadow[_\-]?/i, '')
        .replace(/\.(bat|cmd|ps1|reg)$/i, '')
        .replace(/[_\-]+/g, ' ')
        .trim()
        .toLowerCase();
}

function showTerminal(html, color) {
    terminal.style.display = 'block';
    terminal.style.color = color;
    terminal.style.borderColor = color;
    terminal.innerHTML = html;
}

function updateButtonState() {
    btnLaunch.classList.toggle('has-selection', selection.size > 0);
}

function render(filter = '') {
    const q = normalize(filter);
    const filtered = allProduits.filter(p =>
        normalize(p.fichier).includes(q) || p.nom.toLowerCase().includes(filter.toLowerCase())
    );

    container.innerHTML = '';

    if (allProduits.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                ⚠️ Aucun produit détecté.<br><br>
                Clique sur <b>+</b> pour ouvrir le dossier et y déposer tes scripts achetés.
            </div>
        `;
        updateButtonState();
        return;
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state">Aucun produit ne correspond à "${filter}".</div>`;
        updateButtonState();
        return;
    }

    filtered.forEach((produit, i) => {
        const item = document.createElement('div');
        const isChecked = selection.has(produit.fichier);
        item.className = 'product-item' + (isChecked ? ' active' : '');
        item.style.animationDelay = `${i * 40}ms`;

        let iconHtml;
        if (produit.image) {
            iconHtml = `<img src="${produit.image}" alt="">`;
        } else {
            const [c1, c2] = badgePalette[i % badgePalette.length];
            iconHtml = `<span class="fallback" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(145deg, ${c1}, ${c2});color:#fff;font-weight:700;">${getInitials(produit.nom)}</span>`;
        }

        item.innerHTML = `
            <div class="product-icon">${iconHtml}</div>
            <div class="product-info">
                <div class="product-title">${produit.nom}</div>
                <div class="product-desc">${produit.desc}</div>
            </div>
            <label class="switch">
                <input type="checkbox" class="script-checkbox" data-fichier="${produit.fichier}" ${isChecked ? 'checked' : ''} aria-label="Activer ${produit.nom}">
                <span class="slider"></span>
            </label>
        `;
        container.appendChild(item);
    });

    updateButtonState();
}

async function chargerProduits() {
    try {
        allProduits = await window.shadowAPI.scanProducts();
    } catch (err) {
        container.innerHTML = `<div class="empty-state">⚠️ Erreur de lecture du dossier Shadow_Scripts.<br>${err.message}</div>`;
        return;
    }
    render(searchInput.value);
}

async function lancerScripts() {
    if (selection.size === 0) {
        showTerminal('&gt; ERREUR : Aucun module sélectionné. Veuillez activer au moins un script.', 'var(--neon-red)');
        return;
    }

    const fichiers = Array.from(selection);

    btnLaunch.innerHTML = '⌛ EXÉCUTION EN COURS...';
    btnLaunch.disabled = true;

    showTerminal('&gt; Connexion au moteur Shadow...<br>&gt; Exécution des scripts sélectionnés...', 'var(--neon-cyan)');

    let results;
    try {
        results = await window.shadowAPI.executeScripts(fichiers);
    } catch (err) {
        showTerminal(`&gt; ERREUR CRITIQUE : ${err.message}`, 'var(--neon-red)');
        btnLaunch.innerHTML = "▶ LANCER L'OPTIMISATION";
        btnLaunch.disabled = false;
        return;
    }

    const allOk = results.every(r => r.ok);
    let log = allOk ? '&gt; Scripts exécutés :<br>' : '&gt; Exécution terminée avec des erreurs :<br>';
    results.forEach(r => {
        log += ` - [${r.ok ? 'OK' : 'ÉCHEC'}] ${r.file} — ${r.message}<br>`;
    });

    showTerminal(log, allOk ? 'var(--neon-green)' : 'var(--neon-red)');

    btnLaunch.innerHTML = allOk ? '✓ OPTIMISATION TERMINÉE' : '⚠ TERMINÉ AVEC ERREURS';
    setTimeout(() => {
        btnLaunch.innerHTML = "▶ LANCER L'OPTIMISATION";
        btnLaunch.disabled = false;
    }, 4000);
}

async function redemarrerPC() {
    if (!confirm("ATTENTION : Cela va redémarrer votre machine pour appliquer les modifications.\n\nAvez-vous sauvegardé votre travail ?")) {
        return;
    }
    showTerminal('&gt; Envoi de la commande de redémarrage...', 'var(--neon-red)');
    try {
        const res = await window.shadowAPI.restartPC();
        showTerminal(res.ok ? '&gt; Redémarrage imminent...' : `&gt; ERREUR : ${res.message}`, 'var(--neon-red)');
    } catch (err) {
        showTerminal(`&gt; ERREUR : ${err.message}`, 'var(--neon-red)');
    }
}

// Délégation d'événement : capte les switchs même après un re-rendu (filtre de recherche)
container.addEventListener('change', (e) => {
    if (!e.target.classList.contains('script-checkbox')) return;
    const fichier = e.target.dataset.fichier;
    if (e.target.checked) selection.add(fichier);
    else selection.delete(fichier);
    e.target.closest('.product-item').classList.toggle('active', e.target.checked);
    updateButtonState();
});

searchInput.addEventListener('input', (e) => render(e.target.value));

btnLaunch.addEventListener('click', lancerScripts);
btnRestart.addEventListener('click', redemarrerPC);
btnFolder.addEventListener('click', async () => {
    try {
        const res = await window.shadowAPI.openScriptsFolder();
        if (!res.ok) {
            showTerminal(`&gt; ERREUR : ${res.message}`, 'var(--neon-red)');
        }
        // Le client va ajouter des fichiers dans l'explorateur ; on rescanne
        // le catalogue quand il revient sur la fenêtre du launcher.
        window.addEventListener('focus', chargerProduits, { once: true });
    } catch (err) {
        showTerminal(`&gt; ERREUR : ${err.message}`, 'var(--neon-red)');
    }
});

window.addEventListener('DOMContentLoaded', chargerProduits);

