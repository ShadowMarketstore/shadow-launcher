const container = document.getElementById('product-list-container');
const btnLaunch = document.getElementById('btn-launch');
const btnRestart = document.getElementById('btn-restart');
const terminal = document.getElementById('terminal-log');

function showTerminal(html, color) {
    terminal.style.display = 'block';
    terminal.style.color = color;
    terminal.style.borderColor = color;
    terminal.innerHTML = html;
}

async function chargerProduits() {
    let produits = [];
    try {
        produits = await window.shadowAPI.scanProducts();
    } catch (err) {
        container.innerHTML = `<div class="empty-state">⚠️ Erreur de lecture du dossier Shadow_Scripts.<br>${err.message}</div>`;
        return;
    }

    container.innerHTML = '';

    if (!produits || produits.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                ⚠️ Aucun produit détecté.<br><br>
                Placez vos scripts (.bat, .ps1, .reg) — et une image du même nom<br>
                si vous le souhaitez — dans le dossier <b>Shadow_Scripts</b>.
            </div>
        `;
        return;
    }

    produits.forEach(produit => {
        const item = document.createElement('div');
        item.className = 'product-item';

        const iconHtml = produit.image
            ? `<img src="${produit.image}" alt="">`
            : `<span class="fallback">${produit.ext.replace('.', '').toUpperCase()}</span>`;

        item.innerHTML = `
            <div class="product-icon">${iconHtml}</div>
            <div class="product-info">
                <div class="product-title">${produit.nom}</div>
                <div class="product-desc">${produit.desc}</div>
            </div>
            <label class="switch">
                <input type="checkbox" class="script-checkbox" data-fichier="${produit.fichier}">
                <span class="slider"></span>
            </label>
        `;
        container.appendChild(item);
    });
}

async function lancerScripts() {
    const cases = document.querySelectorAll('.script-checkbox:checked');

    if (cases.length === 0) {
        showTerminal('&gt; ERREUR : Aucun module sélectionné. Veuillez activer au moins un script.', 'var(--neon-red)');
        return;
    }

    const fichiers = Array.from(cases).map(c => c.getAttribute('data-fichier'));

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

btnLaunch.addEventListener('click', lancerScripts);
btnRestart.addEventListener('click', redemarrerPC);

window.addEventListener('DOMContentLoaded', chargerProduits);
