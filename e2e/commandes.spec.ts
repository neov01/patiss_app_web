import { test, expect } from '@playwright/test';

test.describe('Page Commandes - Test complet & Audit ergonomie mobile', () => {
  test.beforeEach(async ({ page }) => {
    // Afficher les erreurs de console dans les logs de test pour debug
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`[BROWSER ERROR] ${msg.text()}`);
      }
    });

    // 1. Accéder directement à la page de connexion
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    
    // 2. Si on est sur le formulaire de login, s'authentifier
    const emailField = page.locator('#email');
    if (await emailField.isVisible()) {
      await emailField.fill('test2@test.ci');
      await page.fill('#password', '1234');
      await page.click('button[type="submit"]');
      
      // Attendre la redirection vers le dashboard
      await page.waitForURL('**/dashboard', { timeout: 15000 });
    }
    
    // 3. Naviguer directement vers /commandes
    await page.goto('/commandes');
    await page.waitForURL('**/commandes', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
  });

  test('Vérification de la structure de base et des onglets', async ({ page }) => {
    // Vérifier que le titre "Commandes" est visible
    const h1 = page.locator('h1');
    await expect(h1).toContainText('Commandes');
    
    // Vérifier la présence des onglets "À traiter" et "Historique"
    const todoTab = page.locator('button:has-text("À traiter")');
    const historyTab = page.locator('button:has-text("📜 Historique")');
    await expect(todoTab).toBeVisible();
    await expect(historyTab).toBeVisible();

    // Tester la commutation sur l'onglet Historique
    await historyTab.click();
    await page.waitForTimeout(500); // laisser le temps de charger l'historique
    await expect(page.locator('button:has-text("Filtres avancés")')).toBeVisible();
    
    // Commuter à nouveau sur À traiter
    await todoTab.click();
    await expect(page.locator('button:has-text("Nouvelle commande")')).toBeVisible();
  });

  test('Interaction avec le Drawer tactile de filtres avancés', async ({ page }) => {
    // Cliquer sur l'onglet Historique
    await page.locator('button:has-text("📜 Historique")').click();
    await page.waitForTimeout(500);

    // Cliquer sur le bouton "Filtres avancés"
    const filtersBtn = page.locator('button:has-text("Filtres avancés")');
    await expect(filtersBtn).toBeVisible();
    await filtersBtn.click();

    // Vérifier l'ouverture du Drawer
    const drawerTitle = page.locator('h3:has-text("Filtres de recherche")');
    await expect(drawerTitle).toBeVisible();

    // Cliquer sur "Date personnalisée" pour ouvrir le DatePicker
    await page.locator('button:has-text("Date personnalisée")').click();

    // Cliquer sur "Début..." pour ouvrir le Calendrier tactile
    await page.locator('button:has-text("Début...")').click();
    
    // Vérifier que le calendrier tactile apparaît
    await expect(page.locator('#datepicker-portal-content')).toBeVisible();
    
    // Sélectionner un jour (le 15 par exemple dans la grille du portal)
    await page.locator('#datepicker-portal-content button').filter({ hasText: /^15$/ }).first().click();

    // Cliquer sur "Montant exact" pour ouvrir le Numpad tactile
    await page.locator('button:has-text("Tous montants")').click();
    // Vérifier la présence du Numpad
    await expect(page.locator('button:has-text("Valider")')).toBeVisible();
    
    // Saisir un montant : 1500
    // On clique sur les touches tactiles en utilisant des regex exactes pour éviter de matcher d'autres textes contenant ces chiffres
    await page.locator('button').filter({ hasText: /^1$/ }).first().click();
    await page.locator('button').filter({ hasText: /^5$/ }).first().click();
    await page.locator('button').filter({ hasText: /^0$/ }).first().click();
    await page.locator('button').filter({ hasText: /^0$/ }).first().click();
    
    // Cliquer sur Valider
    await page.locator('button:has-text("Valider")').click();

    // Fermer le Drawer de filtres en cliquant sur Appliquer (force: true car la barre mobile intercepte le clic sur mobile)
    await page.locator('button:has-text("Appliquer les filtres")').click({ force: true });
  });

  test('Parcours complet de création et suppression de commande', async ({ page }) => {
    // Laisser le temps à React de s'hydrater complètement
    await page.waitForTimeout(2000);

    // 1. Ouvrir la modale de création
    const newOrderBtn = page.locator('button:has-text("Nouvelle commande")');
    await newOrderBtn.click();
    
    // Si la modale n'est pas ouverte à cause du lag d'hydratation React, utiliser dispatchEvent
    const modalHeader = page.locator('h2:has-text("Nouvelle commande")');
    try {
      await expect(modalHeader).toBeVisible({ timeout: 3000 });
    } catch {
      console.log("Modale non ouverte au premier clic, tentative de clic forcé...");
      await newOrderBtn.dispatchEvent('click');
      await expect(modalHeader).toBeVisible({ timeout: 5000 });
    }

    // 2. Remplir le nom client
    const customerName = 'Playwright Test User ' + Math.floor(Math.random() * 10000);
    await page.fill('input[placeholder="Nom du client"]', customerName);

    // 3. Cliquer sur le champ téléphone pour ouvrir le Numpad tactile
    // Le placeholder contient "+225 00000000"
    await page.locator('text="+225 00000000"').click();
    
    // Taper le numéro via le clavier physique émulé sur le Numpad actif
    await page.keyboard.type('0707070707');
    await page.keyboard.press('Enter'); // Valider via Enter

    // 4. Sélectionner une date de retrait via le DatePicker
    await page.locator('button:has-text("Sélectionner une date")').click();
    // Cliquer sur le bouton "Aujourd'hui" tout en bas de la modale calendrier (dispatchEvent pour contourner le positionnement portal/viewport)
    await page.locator('#datepicker-portal-content button:has-text("Aujourd\'hui")').dispatchEvent('click');

    // 5. Sélectionner une heure de retrait via le TimeDigiPad
    await page.locator('button:has-text("Sélectionner l\'heure")').click();
    // Cliquer sur un raccourci d'heure rapide, par exemple "10:00"
    await page.click('button:text("10:00")');

    // 6. Configurer l'article #1 (qui est déjà présent dans la liste par défaut)
    await page.fill('input[placeholder="ex: G\u00E2teau d\'anniversaire..."]', 'G\u00E2teau Chocolat E2E');
    
    // Modifier la quantité de l'article #1 (quantité est à "1" par défaut)
    // Cliquer sur le TouchInput de quantité qui affiche "1"
    const qtyInput = page.locator('div[style*="text-align: center"]').first();
    await qtyInput.click();
    await page.keyboard.type('2');
    await page.keyboard.press('Enter');

    // Modifier le prix unitaire
    const priceInput = page.locator('text="Prix"').first();
    await priceInput.click();
    await page.keyboard.type('5000');
    await page.keyboard.press('Enter');

    // Saisir un acompte
    // Le premier TouchInput sous Récap Financier (ou le dernier du document)
    const depositInput = page.locator('div[style*="text-align: right"]').last();
    await depositInput.click();
    await page.keyboard.type('2000');
    await page.keyboard.press('Enter');

    // Sélectionner le mode de paiement Acompte classique (cliquer sur Espèces par exemple)
    await page.click('button:text("\uD83D\uDCB5 Esp\u00E8ces")');

    // 7. Valider et créer la commande
    await page.click('button[type="submit"]');

    // Attendre que la modale soit fermée
    await expect(page.locator('h2:has-text("Nouvelle commande")')).not.toBeVisible();

    // 8. Vérifier que la commande apparaît dans la liste "À traiter"
    const orderCard = page.locator(`div.card:has-text("${customerName}")`);
    await expect(orderCard).toBeVisible();

    // 9. Supprimer la commande créée pour nettoyer la base de données
    // Cliquer sur le bouton poubelle sur la carte de commande
    const deleteBtn = orderCard.locator('button').filter({ has: page.locator('svg.lucide-trash2') });
    await deleteBtn.click();

    // Confirmer la suppression dans la modale de confirmation
    await expect(page.locator('h3:has-text("Supprimer la commande ?")')).toBeVisible();
    await page.locator('button:has-text("Supprimer")').click();

    // Vérifier que la carte de commande a disparu
    await expect(orderCard).not.toBeVisible();
  });
});
