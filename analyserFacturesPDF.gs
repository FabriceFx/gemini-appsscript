/**
 * Scénario : Analyse de factures PDF (stockées sur Drive) et extraction structurée.
 * Ce script transforme des fichiers PDF en données JSON exploitables (ex: pour Sheets).
 */
function analyserFacturesPDF() {
  // --- CONFIGURATION ---
  const CLE_API = "VOTRE_CLE_API_GEMINI"; // Remplacez par votre clé
  const MODELE = "models/gemini-2.0-flash"; // Modèle rapide et économique
  
  // Remplacez par les vrais IDs de vos fichiers PDF sur Google Drive
  const IDS_FACTURES = [
    "1_xYzAbCdEfGhIjKlMnOpQrStUvWxYz", 
    "1_aBcDeFgHiJkLmNoPqRsTuVwXyZ"
  ]; 
  // ---------------------

  try {
    // 1. Initialisation de la librairie
    const gemini = new GeminiAvecFichiers({
      cleApi: CLE_API,
      modele: MODELE,
      typeMimeReponse: "application/json", // Force la réponse au format JSON
      temperature: 0.1 // Température basse pour une extraction factuelle et précise
    });

    console.log("🚀 Démarrage de l'analyse des factures...");

    // 2. Définition du Schéma JSON (La structure exacte que vous voulez obtenir)
    // C'est ce qui garantit que l'IA ne va pas "inventer" de format.
    const schemaFacture = {
      description: "Données extraites d'un ensemble de factures",
      type: "array", // On attend une liste de factures
      items: {
        type: "object",
        properties: {
          nomFichierOriginal: { type: "string", description: "Le nom du fichier analysé" },
          infosFacture: {
            type: "object",
            properties: {
              numero: { type: "string", description: "Numéro de la facture" },
              dateEmission: { type: "string", description: "Format AAAA-MM-JJ" },
              fournisseur: { type: "string", description: "Nom de l'entreprise émettrice" },
              devise: { type: "string", description: "EUR, USD, etc." }
            },
            required: ["numero", "dateEmission", "fournisseur"]
          },
          montants: {
            type: "object",
            properties: {
              totalHT: { type: "number" },
              totalTVA: { type: "number" },
              totalTTC: { type: "number" }
            },
            required: ["totalTTC"]
          },
          lignesProduits: {
            type: "array",
            description: "Liste des articles ou services facturés",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                quantite: { type: "number" },
                prixUnitaire: { type: "number" },
                totalLigne: { type: "number" }
              }
            }
          }
        }
      }
    };

    // 3. Téléversement des fichiers vers Gemini
    // Note: Gemini ne lit pas directement Drive, il faut lui envoyer les fichiers temporairement.
    console.log(`📤 Téléversement de ${IDS_FACTURES.length} fichier(s)...`);
    const fichiersTeleverses = gemini
      .definirIdsFichiers(IDS_FACTURES)
      .televerserFichiers();

    // 4. Génération / Extraction
    console.log("🧠 Analyse et extraction des données en cours...");
    const resultat = gemini
      .utiliserFichiersTeleverses(fichiersTeleverses)
      .genererContenu({
        q: "Extrais les données de ces factures en respectant strictement le schéma JSON fourni.",
        jsonSchema: schemaFacture
      });

    // 5. Affichage du résultat
    console.log("✅ Données extraites avec succès :");
    console.log(JSON.stringify(resultat, null, 2));

    // --- (Optionnel) Écriture dans Google Sheets ---
    // Si vous voulez sauvegarder le résultat, décommentez les lignes ci-dessous :
    /*
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    // Création des en-têtes si la feuille est vide
    if (sheet.getLastRow() === 0) sheet.appendRow(["Fichier", "Numéro", "Date", "Fournisseur", "Total TTC"]);
    
    const lignes = resultat.map(f => [
      f.nomFichierOriginal,
      f.infosFacture.numero,
      f.infosFacture.dateEmission,
      f.infosFacture.fournisseur,
      f.montants.totalTTC
    ]);
    
    if (lignes.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, lignes.length, lignes[0].length).setValues(lignes);
      console.log("💾 Données sauvegardées dans le tableur.");
    }
    */

    // 6. Nettoyage
    // Bonne pratique : supprimer les fichiers de l'espace de stockage Gemini (quota limité)
    const nomsFichiersASupprimer = fichiersTeleverses.map(f => f.name);
    gemini.supprimerFichiers(nomsFichiersASupprimer);
    console.log("🧹 Fichiers temporaires nettoyés.");

  } catch (erreur) {
    console.error("❌ Une erreur est survenue :", erreur.message);
    if (erreur.stack) console.error(erreur.stack);
  }
}
