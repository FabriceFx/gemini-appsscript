/**
 * Exemple : Analyse d'une image stockée sur Google Drive
 */
function exempleAnalyseImage() {
  const CLE_API = "VOTRE_CLE_API_GEMINI";
  const ID_FICHIER_IMAGE = "ID_DE_VOTRE_IMAGE_SUR_DRIVE"; // Ex: "1abc..."

  try {
    // 1. Initialisation
    const gemini = new GeminiAvecFichiers({
      cleApi: CLE_API,
      modele: "models/gemini-2.0-flash",
      temperature: 0.7
    });

    // 2. Téléversement du fichier (L'API Gemini nécessite que le fichier soit uploadé chez eux)
    console.log("Téléversement en cours...");
    const fichiersUploades = gemini
      .definirIdsFichiers([ID_FICHIER_IMAGE])
      .televerserFichiers();

    // 3. Génération de contenu
    console.log("Analyse en cours...");
    const reponse = gemini
      .utiliserFichiersTeleverses(fichiersUploades)
      .genererContenu({
        q: "Décris cette image en détail en français."
      });

    console.log("Réponse de l'IA :", reponse);

    // 4. Nettoyage (Optionnel : supprimer le fichier de Gemini pour ne pas encombrer le stockage)
    const nomsASupprimer = fichiersUploades.map(f => f.name);
    gemini.supprimerFichiers(nomsASupprimer);
    console.log("Fichiers temporaires supprimés.");

  } catch (erreur) {
    console.error("Erreur :", erreur.message);
  }
}
