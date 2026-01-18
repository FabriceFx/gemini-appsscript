/**
 * Exemple : Upload résumable pour gros fichiers (> 50 Mo)
 * Ce script est conçu pour être relancé plusieurs fois si nécessaire.
 */
function traiterGrosseVideo() {
  const CLE_API = "VOTRE_CLE_API_GEMINI";
  // URL d'une vidéo de test (~64 Mo)
  const URL_VIDEO = "https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4";

  try {
    // 1. Initialisation avec le service de propriétés (CRUCIAL pour la reprise)
    // Le serviceProprietes permet de stocker l'avancement de l'upload entre les exécutions.
    const gemini = new GeminiAvecFichiers({
      cleApi: CLE_API,
      modele: "models/gemini-2.0-flash", // Modèle multimodal performant
      serviceProprietes: PropertiesService.getScriptProperties(),
      // Mettre à true si vous voulez forcer un redémarrage de l'upload à zéro
      uploadResumableCommeNouveau: false 
    });

    console.log("Démarrage du processus d'upload résumable...");

    // 2. Configuration de l'upload
    // On peut passer soit { url: "..." } soit { fileId: "..." } (ID Drive)
    const fichierEnCours = gemini
      .definirIdsOuUrlsPourUploadResumable([{ url: URL_VIDEO }])
      .televerserFichiers();

    // 3. Vérification du résultat de l'upload
    // Si l'upload a été interrompu par le temps limite (6 min), 'fichierEnCours' contiendra un message.
    if (fichierEnCours[0] && fichierEnCours[0].message) {
      console.warn("⚠️ TEMPS LIMITE ATTEINT OU UPLOAD INCOMPLET.");
      console.warn("Message système : " + fichierEnCours[0].message);
      console.warn("👉 ACTION REQUISE : Relancez ce script manuellement pour continuer l'upload là où il s'est arrêté.");
      return; // On arrête ici, on attend la prochaine exécution
    }

    // 4. Si on arrive ici, l'upload est terminé à 100%
    console.log("✅ Upload terminé avec succès !");
    console.log("Fichier reçu :", fichierEnCours[0].displayName);
    console.log("État actuel :", fichierEnCours[0].state);

    // 5. Attente du traitement côté Google (état "ACTIVE")
    // Pour les grosses vidéos, Gemini prend du temps à traiter le fichier après réception.
    console.log("Attente du traitement de la vidéo par Gemini...");
    
    // On utilise la méthode interne qui gère l'attente active
    // Elle va vérifier le statut et attendre que ce soit "ACTIVE"
    const reponse = gemini
      .utiliserFichiersTeleverses(fichierEnCours)
      .genererContenu({
        q: "Fais un résumé détaillé de ce qui se passe dans cette vidéo. Décris les personnages et l'action chronologiquement.",
        temperature: 0.4
      });

    console.log("🎬 Analyse de la vidéo :");
    console.log(reponse);

    // 6. Nettoyage (Bonne pratique)
    // gemini.supprimerFichiers([fichierEnCours[0].name]);

  } catch (erreur) {
    console.error("❌ Erreur critique :", erreur.message);
    if (erreur.stack) console.error(erreur.stack);
  }
}
