/**
 * Scénario Cooperl : Diagnostic de panne machine assisté par vidéo.
 * Analyse une vidéo de dysfonctionnement en la comparant aux manuels techniques PDF.
 */
function diagnostiquerPanneMachine() {
  const CLE_API = "VOTRE_CLE_API";
  
  // URL de la vidéo uploadée par le technicien (via une AppSheet ou un Formulaire)
  const URL_VIDEO_PANNE = "https://exemple.com/video-panne-trancheuse.mp4"; 
  // ID du manuel technique de la machine (ex: "Manuel_Trancheuse_Weber.pdf")
  const ID_MANUEL_TECHNIQUE = "ID_FICHIER_DRIVE_MANUEL";

  try {
    // ServiceProprietes requis pour l'upload résumable de vidéo si fichier lourd
    const gemini = new GeminiAvecFichiers({
      cleApi: CLE_API,
      modele: "models/gemini-2.0-flash", // Multimodalité vidéo native
      serviceProprietes: PropertiesService.getScriptProperties()
    });

    console.log("🔧 Réception de la demande de maintenance...");

    // 1. Upload de la vidéo (via URL ou Drive)
    // Utilisation de la méthode résumable pour gérer les grosses vidéos de maintenance
    const videoUpload = gemini
      .definirIdsOuUrlsPourUploadResumable([{ url: URL_VIDEO_PANNE }])
      .televerserFichiers();

    // Vérification si l'upload est terminé (pour les gros fichiers)
    if (videoUpload[0].message) {
      console.warn("⏳ Upload vidéo en cours... Relancez le script.");
      return;
    }

    // 2. Upload du Manuel Technique (PDF) pour donner le contexte à l'IA
    // On combine Vidéo (Le problème) + PDF (La référence)
    console.log("📖 Lecture du manuel technique...");
    const manuelUpload = gemini
      .definirIdsFichiers([ID_MANUEL_TECHNIQUE])
      .televerserFichiers();

    // 3. Fusion des sources pour l'analyse
    const sourcesContexte = [...videoUpload, ...manuelUpload];

    console.log("🧠 Analyse croisée Vidéo + Documentation...");

    // 4. Génération du diagnostic
    const diagnostic = gemini
      .utiliserFichiersTeleverses(sourcesContexte)
      .genererContenu({
        q: `Tu es un expert en maintenance industrielle agroalimentaire.
            Regarde cette vidéo de la machine et écoute attentivement le bruit.
            En utilisant le manuel technique fourni en référence :
            1. Identifie la partie de la machine qui semble défaillante (ex: roulement, lame, hydraulique).
            2. Cite la page du manuel qui parle de ce problème.
            3. Propose une action corrective immédiate (Graissage, Changement pièce, Arrêt d'urgence).`,
        temperature: 0.4 // Légère créativité pour l'hypothèse de panne
      });

    console.log("🛠️ Rapport de diagnostic :");
    console.log(diagnostic);

    // Idée : Envoyer ce rapport directement dans le ticket de maintenance (GMAO)

    // 5. Nettoyage
    gemini.supprimerFichiers(sourcesContexte.map(f => f.name));

  } catch (erreur) {
    console.error("❌ Erreur diagnostic maintenance :", erreur.message);
  }
}
