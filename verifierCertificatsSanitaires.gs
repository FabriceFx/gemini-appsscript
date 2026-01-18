/**
 * Scénario Agro : Extraction de données structurées depuis des Bulletins d'Analyse (PDF).
 * Permet de vérifier automatiquement la conformité bactériologique.
 */
function verifierCertificatsSanitaires() {
  const CLE_API = "VOTRE_CLE_API";
  // IDs des PDF reçus des laboratoires (ex: Eurofins, Phytocontrol...)
  const IDS_CERTIFICATS = ["ID_PDF_1", "ID_PDF_2"]; 

  try {
    const gemini = new GeminiAvecFichiers({
      cleApi: CLE_API,
      modele: "models/gemini-2.0-flash", 
      temperature: 0.0 // Zéro créativité, on veut de l'extraction pure
    });

    // Schéma JSON ciblant les pathogènes critiques
    const schemaLabo = {
      description: "Extraction des résultats d'analyses microbiologiques",
      type: "array",
      items: {
        type: "object",
        properties: {
          referenceEchantillon: { type: "string", description: "Numéro de lot ou référence client" },
          datePrelevement: { type: "string", description: "Format AAAA-MM-JJ" },
          laboratoire: { type: "string" },
          resultatsAnalyses: {
            type: "array",
            items: {
              type: "object",
              properties: {
                germe: { type: "string", description: "Ex: Listeria monocytogenes, Salmonella" },
                resultat: { type: "string", description: "Ex: < 10 UFC/g, Détecté, Non détecté" },
                conforme: { type: "boolean", description: "Vrai si le résultat respecte les normes CE 2073/2005" }
              }
            }
          }
        }
      }
    };

    console.log(`📑 Traitement de ${IDS_CERTIFICATS.length} certificats...`);

    // Téléversement des PDF
    const fichiersLabo = gemini
      .definirIdsFichiers(IDS_CERTIFICATS)
      .televerserFichiers();

    // Génération
    const analyses = gemini
      .utiliserFichiersTeleverses(fichiersLabo)
      .genererContenu({
        q: "Extrais les données de ces certificats d'analyse. Pour le champ 'conforme', réfère-toi aux seuils standards (Listeria < 100, Absence Salmonella 25g).",
        jsonSchema: schemaLabo
      });

    // Logique métier : Alerte immédiate si Non Conforme
    analyses.forEach(certificat => {
      const alertes = certificat.resultatsAnalyses.filter(r => r.conforme === false);
      
      if (alertes.length > 0) {
        console.warn(`🚨 ALERTE SANITAIRE sur lot ${certificat.referenceEchantillon} !`);
        alertes.forEach(a => console.warn(`   - ${a.germe} : ${a.resultat}`));
        // Ici : envoyerEmailAlerteQualite(certificat);
      } else {
        console.log(`✅ Lot ${certificat.referenceEchantillon} : Conforme.`);
      }
    });

    // Nettoyage des fichiers temporaires
    gemini.supprimerFichiers(fichiersLabo.map(f => f.name));

  } catch (erreur) {
    console.error("❌ Erreur lecture certificats :", erreur.message);
  }
}
