/**
 * GeminiAvecFichiers
 * Bibliothèque Google Apps Script pour simplifier l'utilisation de l'API Gemini
 * avec des données non structurées (images, PDF, audio, vidéo).
 * Auteur : Fabrice Faucheux
 * * @class GeminiAvecFichiers
 */
class GeminiAvecFichiers {

  /**
   * Constructeur de la classe GeminiAvecFichiers.
   * * @param {Object} configuration Objet de configuration.
   * @param {string} configuration.cleApi La clé API Google AI Studio.
   * @param {string} [configuration.modele="models/gemini-1.5-flash"] Le modèle à utiliser.
   * @param {string} [configuration.version="v1beta"] Version de l'API.
   * @param {boolean} [configuration.compterTokens=false] Si vrai, logue le nombre de tokens.
   * @param {Array}  [configuration.historique=[]] Historique pour le chat.
   * @param {string} [configuration.typeMimeReponse] Type MIME de réponse (ex: "application/json").
   * @param {Object} [configuration.schemaReponse] Schéma JSON pour le format de sortie.
   * @param {number} [configuration.temperature] Température pour la créativité (0.0 à 2.0).
   * @param {Object} [configuration.instructionSysteme] Instructions système pour le modèle.
   * @param {boolean} [configuration.exporterDonneesBrutes=false] Retourne la réponse brute de l'API.
   * @param {Object} [configuration.serviceProprietes] Requis pour les uploads résumables (PropertiesService.getScriptProperties()).
   */
  constructor(configuration = {}) {
    const {
      cleApi,
      accessToken,
      modele,
      version,
      compterTokens,
      historique,
      fonctions,
      typeMimeReponse,
      schemaReponse,
      schemaJsonReponse,
      temperature,
      instructionSysteme,
      exporterTotalTokens,
      exporterDonneesBrutes,
      configOutils,
      outils,
      serviceProprietes,
      uploadResumableCommeNouveau,
      configGeneration
    } = configuration;

    /** @private */
    this.modele = modele || "models/gemini-2.0-flash"; // Modèle par défaut stable et rapide
    /** @private */
    this.version = version || "v1beta";

    const urlBase = "https://generativelanguage.googleapis.com";
    
    // Endpoints API
    this.urlGenererContenu = `${urlBase}/${this.version}/${this.modele}:generateContent`;
    this.urlTeleverserFichier = `${urlBase}/upload/${this.version}/files`;
    this.urlListeFichiers = `${urlBase}/${this.version}/files`;
    this.urlSupprimerFichier = `${urlBase}/${this.version}/`;
    this.urlCompterTokens = `${urlBase}/${this.version}/${this.modele}:countTokens`;

    // Configuration interne
    this.compterTokens = compterTokens || false;
    this.exporterTotalTokens = exporterTotalTokens || false;
    this.exporterDonneesBrutes = exporterDonneesBrutes || false;
    this.totalTokens = 0;

    this.parametresRequete = {};
    if (cleApi) {
      this.parametresRequete.key = cleApi;
    }

    this.jetonAcces = accessToken || ScriptApp.getOAuthToken();
    this.enTetes = { authorization: `Bearer ${this.jetonAcces}` };

    // Stockage temporaire des fichiers
    this.idsFichiers = [];
    this.commeImage = false;
    this.blobs = [];
    this.uploadsResumables = [];
    this.listeFichiersTeleverses = [];

    // Configuration de la génération
    this.typeMimeReponse = typeMimeReponse || "";
    this.instructionSysteme = instructionSysteme || null;
    this.fonctions = fonctions && fonctions.params_ ? fonctions : {};
    this.temperature = temperature === undefined || temperature === null ? null : temperature;
    
    // Schemas
    this.schemaReponse = schemaReponse || null;
    this.schemaJsonReponse = schemaJsonReponse || null;

    // Outils (Function calling, Code execution)
    this.configOutils = configOutils || {};
    const clesFonctions = Object.keys(this.fonctions);
    if (clesFonctions.length > 0) {
      this.configOutils = {
        ...this.configOutils,
        functionCallingConfig: {
          mode: "ANY",
          allowedFunctionNames: clesFonctions.filter(e => e !== "params" && e !== "params_")
        }
      };
    }

    this.historique = historique || [];
    this.outils = outils || [];
    this.serviceProprietes = serviceProprietes;
    this.uploadResumableCommeNouveau = uploadResumableCommeNouveau || false;
    this.configGeneration = configGeneration || {};
  }

  /**
   * Définit les IDs des fichiers Drive à traiter.
   * * @param {Array<string>} idsFichiers Liste des IDs de fichiers Google Drive.
   * @param {boolean} [commeImage=false] Si vrai, force le traitement comme image (thumbnail).
   * @returns {GeminiAvecFichiers} L'instance pour chaînage.
   */
  definirIdsFichiers(idsFichiers, commeImage = false) {
    this.idsFichiers.push(...idsFichiers);
    this.commeImage = commeImage;
    return this;
  }

  /**
   * Définit les Blobs à traiter.
   * * @param {Array<Blob>} blobs Liste des objets Blob.
   * @returns {GeminiAvecFichiers} L'instance pour chaînage.
   */
  definirBlobs(blobs) {
    this.blobs.push(...blobs);
    return this;
  }

  /**
   * Prépare un upload résumable pour les gros fichiers (> 50Mo) ou URLs externes.
   * Nécessite `serviceProprietes` dans le constructeur.
   * * @param {Array<Object>} tableau Liste d'objets contenant {url} ou {fileId}.
   * @returns {GeminiAvecFichiers} L'instance pour chaînage.
   */
  definirIdsOuUrlsPourUploadResumable(tableau) {
    this.uploadsResumables.push(...tableau);
    return this;
  }

  /**
   * Associe les fichiers déjà téléversés à la prochaine génération de contenu.
   * Gère l'attente si le fichier est en cours de traitement ("PROCESSING").
   * * @param {Array} listeFichiers La liste retournée par televerserFichiers().
   * @param {number} [nouvelleTentative=3] Nombre de tentatives si le fichier n'est pas prêt.
   * @returns {GeminiAvecFichiers} L'instance pour chaînage.
   */
  utiliserFichiersTeleverses(listeFichiers = [], nouvelleTentative = 3) {
    if (listeFichiers.length === 0) {
      throw new Error("La liste de fichiers fournie est vide.");
    }

    // Vérification de l'état des fichiers
    const enTraitement = listeFichiers.filter(({ state }) => state === "PROCESSING");
    
    if (enTraitement.length > 0) {
      if (nouvelleTentative > 0) {
        const tempsAttente = 10; // secondes
        const nomsFichiers = enTraitement.map(({ displayName }) => displayName);
        console.warn(`En attente de l'activation des fichiers : "${nomsFichiers.join(", ")}". Pause de ${tempsAttente} secondes. Tentative (${4 - nouvelleTentative}/3)`);
        
        const objTemp = listeFichiers.reduce((acc, { name }) => (acc[name] = true, acc), {});
        const listeAJour = this.recupererListeFichiersSurGemini().filter(({ name }) => objTemp[name]);
        
        Utilities.sleep(tempsAttente * 1000);
        return this.utiliserFichiersTeleverses(listeAJour, --nouvelleTentative);
      } else {
        console.warn("Délai d'attente dépassé. Le fichier n'est pas encore 'ACTIVE'.");
      }
    }

    // Organisation des fichiers pour la requête
    const mapFichiers = listeFichiers.reduce((map, fichier) => {
      let cle = fichier.displayName;
      // Logique pour grouper les pages si nécessaire (héritée de la logique PDF/Image)
      if (/^fileId@.*?\$page@.*\$maxPage@.*$/.test(fichier.displayName)) {
        cle = fichier.displayName.split("$")[0].split("@")[1];
      } else if (/^blobName@.*$/.test(fichier.displayName)) {
        cle = fichier.displayName.split("@")[1];
      }
      
      const existants = map.get(cle) || [];
      map.set(cle, [...existants, fichier]);
      return map;
    }, new Map());

    // Tri des pages si nécessaire
    mapFichiers.forEach((valeurs, cle) => {
      if (valeurs.length > 0 && /^fileId@.*?\$page@.*\$maxPage@.*$/.test(valeurs[0].displayName)) {
        valeurs.sort((a, b) => {
          const pageA = Number(a.displayName.split("$")[1].split("@")[1]);
          const pageB = Number(b.displayName.split("$")[1].split("@")[1]);
          return pageA - pageB;
        });
      }
    });

    this.listeFichiersTeleverses = [...mapFichiers.values()].map(files => ({ files }));
    return this;
  }

  /**
   * Téléverse les fichiers vers l'API Gemini.
   * * @param {number} [tailleLot=50] Nombre de fichiers à uploader en parallèle.
   * @returns {Array} Liste des métadonnées des fichiers téléversés.
   */
  televerserFichiers(tailleLot = 50) {
    const params = { ...this.parametresRequete, uploadType: "multipart" };
    const url = this._ajouterParametresRequete(this.urlTeleverserFichier, params);

    // Cas 1 : IDs Drive
    if (this.idsFichiers.length > 0) {
      const requetes = this.idsFichiers.map(id => {
        const metadata = { file: { displayName: `fileId@${id}$page@1$maxPage@1` } };
        let fichierBlob;
        
        if (this.commeImage) {
           // Récupération du thumbnail
           const rep = this._fetch({ url: `https://drive.google.com/thumbnail?sz=w1500&id=${id}`, headers: this.enTetes });
           fichierBlob = rep.getBlob();
        } else {
           fichierBlob = DriveApp.getFileById(id).getBlob();
        }

        return {
          url,
          method: "post",
          payload: { metadata: Utilities.newBlob(JSON.stringify(metadata), "application/json"), file: fichierBlob },
          muteHttpExceptions: true
        };
      });
      return this._executerRequetesTeleversement(requetes, tailleLot);
    } 
    // Cas 2 : Blobs directs
    else if (this.blobs.length > 0) {
      const requetes = this.blobs.map(blob => {
        const metadata = { file: { displayName: `blobName@${blob.getName()}` } };
        return {
          url,
          method: "post",
          payload: { metadata: Utilities.newBlob(JSON.stringify(metadata), "application/json"), file: blob },
          ...(this.parametresRequete.key ? {} : { headers: this.enTetes }),
          muteHttpExceptions: true
        };
      });
      return this._executerRequetesTeleversement(requetes, tailleLot);
    }
    // Cas 3 : Upload Résumable (Gros fichiers)
    else if (this.uploadsResumables.length > 0) {
      return this.uploadsResumables.map(e => this._executerUploadApp(e));
    }

    throw new Error("Aucun élément à téléverser.");
  }

  /**
   * Exécute les requêtes de téléversement par lots.
   * @private
   */
  _executerRequetesTeleversement(requetes, tailleLot) {
    console.log(`Nombre total d'éléments à téléverser : ${requetes.length}`);
    
    // Découpage en lots
    const lots = [];
    while (requetes.length > 0) {
      lots.push(requetes.splice(0, tailleLot));
    }

    const fichiersTeleverses = lots.flatMap((lot, index) => {
      console.log(`Traitement du lot ${index + 1}/${lots.length}...`);
      const reponses = UrlFetchApp.fetchAll(lot);
      
      return reponses
        .map(r => JSON.parse(r.getContentText()))
        .reduce((acc, { file }) => {
          if (file) acc.push(file);
          return acc;
        }, []);
    });

    return fichiersTeleverses;
  }

  /**
   * Récupère la liste des fichiers actuellement stockés sur Gemini.
   * * @returns {Array} Liste des fichiers.
   */
  recupererListeFichiersSurGemini() {
    const listeFinale = [];
    const params = { ...this.parametresRequete, pageSize: 100 };
    let pageToken = "";

    do {
      params.pageToken = pageToken;
      const url = this._ajouterParametresRequete(this.urlListeFichiers, params);
      const reponse = this._fetch({ url, ...(this.parametresRequete.key ? {} : { headers: this.enTetes }) });
      const objet = JSON.parse(reponse.getContentText());
      
      pageToken = objet.nextPageToken;
      if (objet.files && objet.files.length > 0) {
        listeFinale.push(...objet.files);
      }
    } while (pageToken);

    this.listeFichiersTeleverses = listeFinale;
    return listeFinale;
  }

  /**
   * Supprime des fichiers de Gemini.
   * * @param {Array<string>} nomsFichiers Liste des propriétés 'name' (ex: 'files/abc12345').
   * @param {number} [tailleLot=50] Taille du lot de suppression.
   */
  supprimerFichiers(nomsFichiers, tailleLot = 50) {
    const requetes = nomsFichiers.map(nom => ({
      url: `${this.urlSupprimerFichier}${nom}` + (this.parametresRequete.key ? `?key=${this.parametresRequete.key}` : ""),
      method: "delete",
      ...(this.parametresRequete.key ? {} : { headers: this.enTetes }),
      muteHttpExceptions: true
    }));

    if (requetes.length === 0) return [];

    console.log(`${requetes.length} fichiers vont être supprimés.`);
    
    const lots = [];
    while (requetes.length > 0) {
      lots.push(requetes.splice(0, tailleLot));
    }

    return lots.flatMap(lot => UrlFetchApp.fetchAll(lot).map(r => JSON.parse(r.getContentText())));
  }

  /**
   * Méthode principale pour générer du contenu via l'IA.
   * * @param {Object} objet Configuration de la requête.
   * @param {string} [objet.q] La question ou le prompt textuel.
   * @param {Object} [objet.jsonSchema] Un schéma JSON optionnel.
   * @param {Array} [objet.parts] Parties personnalisées (texte + media).
   * @param {number} [retry=5] Nombre de tentatives en cas d'erreur serveur.
   * @returns {(string|Object)} La réponse de l'IA.
   */
  genererContenu(objet, retry = 5) {
    if (!objet || typeof objet !== "object") {
      throw new Error("Veuillez fournir un objet contenant la question (q).");
    }

    let { q, jsonSchema, parts } = objet;

    // Validation
    if ((!q || q === "") && (!jsonSchema) && (!parts || !Array.isArray(parts))) {
      throw new Error("Veuillez définir une question ou un prompt.");
    }

    // Si on a juste un schéma sans question, on force l'instruction
    if ((!q || q === "") && jsonSchema && !parts) {
      q = `Veuillez suivre le schéma JSON suivant : <JSONSchema>${JSON.stringify(jsonSchema)}</JSONSchema>`;
    }

    // Gestion des fichiers attachés
    const fichiersUtilises = this.listeFichiersTeleverses.length > 0 ? this.listeFichiersTeleverses : [];
    if (fichiersUtilises.length > 0) {
      const totalFichiers = fichiersUtilises.reduce((acc, obj) => acc + (obj.files ? obj.files.length : 1), 0);
      console.log(`${totalFichiers} fichiers utilisés pour la génération.`);
    }

    // Préparation des déclarations de fonctions (Function Calling)
    const declarationsFonctions = Object.keys(this.fonctions).flatMap((cle) =>
      cle !== "params_"
        ? {
          name: cle,
          description: this.fonctions.params_[cle]?.description,
          parameters: this.fonctions.params_[cle]?.parameters,
          response: this.fonctions.params_[cle]?.response,
        }
        : []
    );

    // Construction du payload "parts" avec les fichiers
    const fichiersFormatAPI = fichiersUtilises.flatMap(({ files, mimeType, uri, name }) => {
      // Logique d'affichage du nom de fichier dans le prompt pour le contexte
      let nomFichier = name;
      let texteIntro = `[Fichier : ${nomFichier}]`;

      if (files && Array.isArray(files)) {
        if (files.length > 0) {
            // Extraction propre du nom si format interne
            if (/^fileId@/.test(files[0].displayName)) {
                nomFichier = files[0].displayName.split("$")[0].split("@")[1];
            }
            texteIntro = `[Fichier : ${nomFichier}. Pages : ${files.length}]`;
            
            return [
                { text: texteIntro },
                ...files.flatMap(f => ({ fileData: { fileUri: f.uri, mimeType: f.mimeType } }))
            ];
        }
      }
      return [
        { text: texteIntro },
        { fileData: { fileUri: uri, mimeType } }
      ];
    });

    // Construction du contenu complet (Historique + Nouveau Prompt + Fichiers)
    const contenuRequete = [...this.historique];
    const nouvellesParties = parts ? [...parts, ...fichiersFormatAPI] : [{ text: q }, ...fichiersFormatAPI];
    contenuRequete.push({ parts: nouvellesParties, role: "user" });

    // Boucle de génération (gestion des appels de fonctions et retries)
    let verifierAppelFonction = [];
    let metaDonneesUsage;
    let resultats = [];
    let resultatBrut = {};
    let resultatsMultiples = false;
    
    const url = this._ajouterParametresRequete(this.urlGenererContenu, this.parametresRequete);

    do {
      retry--;
      const outilsAPI = declarationsFonctions.length > 0 ? [{ function_declarations: declarationsFonctions }] : [];
      const payload = { contents: contenuRequete, tools: outilsAPI };

      // Configuration de la génération
      payload.generationConfig = this.configGeneration;
      
      // Gestion Schema et MIME Type
      if (this.typeMimeReponse !== "") {
        payload.generationConfig.response_mime_type = this.typeMimeReponse;
      }
      if (this.schemaReponse) {
        payload.generationConfig.response_schema = this.schemaReponse;
        payload.generationConfig.response_mime_type = "application/json";
      } else if (this.schemaJsonReponse) {
        payload.generationConfig.response_json_schema = this.schemaJsonReponse;
        payload.generationConfig.response_mime_type = "application/json";
      }

      if (this.temperature !== null) payload.generationConfig.temperature = this.temperature;
      if (this.instructionSysteme) payload.systemInstruction = this.instructionSysteme;
      if (Object.keys(this.configOutils).length > 0) payload.toolConfig = this.configOutils;
      if (this.outils && this.outils.length > 0) payload.tools = this.outils;

      // Option Compter les tokens (debug)
      if (this.compterTokens) {
        try {
            const resCount = this._fetch({
                url: this._ajouterParametresRequete(this.urlCompterTokens, this.parametresRequete),
                method: "post",
                payload: JSON.stringify({ contents: payload.contents }),
                contentType: "application/json",
                ...(this.parametresRequete.key ? {} : { headers: this.enTetes }),
                muteHttpExceptions: true,
            }, false);
            if (resCount.getResponseCode() === 200) {
                console.log("Compte de tokens : " + resCount.getContentText());
            }
        } catch (e) {
            console.warn("Erreur lors du comptage des tokens (ignorée) : " + e.message);
        }
      }

      // Appel API Principal
      const reponseAPI = this._fetch({
        url,
        method: "post",
        payload: JSON.stringify(payload),
        contentType: "application/json",
        ...(this.parametresRequete.key ? {} : { headers: this.enTetes }),
        muteHttpExceptions: true,
      }, false);

      // Gestion erreur 500 (Retry)
      if (reponseAPI.getResponseCode() === 500 && retry > 0) {
        console.warn("Erreur 500 détectée. Nouvelle tentative dans 3 secondes...");
        Utilities.sleep(3000);
        continue; 
      } else if (reponseAPI.getResponseCode() !== 200) {
        throw new Error(`Erreur API (${reponseAPI.getResponseCode()}) : ${reponseAPI.getContentText()}`);
      }

      const donneesReponse = JSON.parse(reponseAPI.getContentText());

      if (this.exporterDonneesBrutes) {
        resultatBrut = { ...donneesReponse };
        break;
      }

      const { candidates, usageMetadata } = donneesReponse;
      metaDonneesUsage = { ...usageMetadata };

      if (candidates && !candidates[0]?.content?.parts) {
        resultats.push(candidates[0]);
        break;
      }

      const partiesRecues = (candidates && candidates[0]?.content?.parts) || [];
      resultats.push(...partiesRecues);
      
      // Mise à jour historique
      contenuRequete.push({ parts: partiesRecues.slice(), role: "model" });

      // Vérification Function Calling
      if (!payload.contents[payload.contents.length - 1].parts.some(pp => pp.functionCall)) {
        this.historique = contenuRequete;
        break; // Pas d'appel de fonction, on sort
      }

      verifierAppelFonction = partiesRecues.filter(pp => pp.functionCall && pp.functionCall.name);
      
      if (verifierAppelFonction.length > 0) {
        if (verifierAppelFonction.length !== 1) resultatsMultiples = true;

        const reponsesFonctions = [];
        for (const appel of verifierAppelFonction) {
          const nomFonction = appel.functionCall.name;
          console.log(`Exécution de la fonction : ${nomFonction}`);
          
          try {
              const resultatFonction = this.fonctions[nomFonction](appel.functionCall.args || null);
              
              reponsesFonctions.push({
                functionResponse: {
                  name: nomFonction,
                  response: { name: nomFonction, content: resultatFonction },
                },
              });
              
              partiesRecues.push({ functionResponse: resultatFonction });
              resultats = [...partiesRecues];

          } catch (errFonction) {
              console.error(`Erreur dans la fonction ${nomFonction}: ${errFonction.message}`);
          }
        }
        
        contenuRequete.push({ parts: reponsesFonctions, role: "function" });
        this.historique = contenuRequete;
        verifierAppelFonction = []; // Reset pour la boucle
      } else {
        this.historique = contenuRequete;
      }

    } while ((verifierAppelFonction.length > 0 || retry > 0) && retry > 0);

    if (this.exporterDonneesBrutes) return resultatBrut;

    const sortieFinale = resultats[resultats.length - 1];
    if (!sortieFinale) return "Aucune valeur retournée.";

    let valeurRetour;
    if (resultatsMultiples) {
      valeurRetour = resultats.filter(pp => pp.functionResponse);
    } else {
      valeurRetour = sortieFinale.text ? sortieFinale.text.trim() : sortieFinale;
    }

    // Tentative de parsing JSON si possible ou retour texte
    let retourParse = valeurRetour;
    try {
        if (typeof valeurRetour === 'string') {
             // Nettoyage Markdown JSON ```json ... ```
             const jsonClean = valeurRetour.replace(/^```json\s*/, "").replace(/\s*```$/, "");
             retourParse = JSON.parse(jsonClean);
        }
    } catch (e) {
        // Ce n'est pas du JSON, on garde le texte
    }

    if (this.exporterTotalTokens) {
      return { valeurRetour: retourParse, metaDonneesUsage };
    }
    return retourParse;
  }

  /**
   * Mode Chat : Envoie un message et conserve l'historique automatiquement.
   * * @param {Object} objet Configuration (q, parts).
   * @param {Object} [options] Options pour réinitialiser des propriétés internes.
   * @returns {Object} La réponse complète.
   */
  discuter(objet, options = {}) {
    this.exporterDonneesBrutes = true;
    
    // Application des options temporaires
    Object.entries(options).forEach(([k, v]) => {
        if (this[k] !== undefined) this[k] = v;
    });

    const reponse = this.genererContenu(objet);
    
    // Ajout manuel à l'historique si nécessaire (géré aussi dans genererContenu mais sécurisé ici pour le mode Chat explicite)
    // Note: genererContenu met déjà à jour this.historique.
    
    return reponse;
  }

  /**
   * Ajoute des paramètres de requête à une URL.
   * @private
   */
  _ajouterParametresRequete(url, objet) {
    if (!objet) return url;
    const params = Object.entries(objet)
      .flatMap(([k, v]) => Array.isArray(v) ? v.map(e => `${k}=${encodeURIComponent(e)}`) : `${k}=${encodeURIComponent(v)}`)
      .join("&");
    return url + (url.includes("?") ? "&" : "?") + params;
  }

  /**
   * Wrapper pour UrlFetchApp avec gestion d'erreurs.
   * @private
   */
  _fetch(objet, verifierErreur = true) {
    objet.muteHttpExceptions = true;
    const reponse = UrlFetchApp.fetchAll([objet])[0];
    if (verifierErreur && reponse.getResponseCode() !== 200) {
      throw new Error(`Erreur Fetch (${reponse.getResponseCode()}) : ${reponse.getContentText()}`);
    }
    return reponse;
  }

  /**
   * Gère l'upload résumable (Large fichiers).
   * @private
   */
  _executerUploadApp(objetConfig) {
    const { url, fileId } = objetConfig;
    const nomAffichage = url ? `url@${url}$page@1$maxPage@1` : `fileId@${fileId}$page@1$maxPage@1`;

    const configUpload = {
      destination: {
        uploadUrl: `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=resumable&key=${this.parametresRequete.key}`,
        metadata: { file: { displayName: nomAffichage } }
      },
      accessToken: this.jetonAcces,
      serviceProprietes: this.serviceProprietes,
      reinitialiser: this.uploadResumableCommeNouveau
    };

    if (url) configUpload.source = { url };
    else if (fileId) configUpload.source = { fileId };
    else throw new Error("Ni URL ni ID fichier fournis pour l'upload résumable.");

    // Classe interne simplifiée pour l'upload résumable
    const appUpload = new ApplicationTeleversement(configUpload);
    const resultat = appUpload.executer();
    return resultat.file;
  }
}

/**
 * Classe utilitaire interne pour gérer les uploads résumables (Chunking).
 * @private
 */
class ApplicationTeleversement {
  constructor(obj = {}) {
    this.proprietes = obj.serviceProprietes;
    if (!this.proprietes) throw new Error("Service Propriétés requis.");

    if (obj.reinitialiser) {
        this.proprietes.deleteProperty("upload_next");
    }

    const suivant = this.proprietes.getProperty("upload_next");
    if (!suivant && (!obj.source || (!obj.source.fileId && !obj.source.url))) {
      throw new Error("Source invalide pour l'upload.");
    } else if (suivant) {
      this.objTemp = JSON.parse(suivant);
      this.courant = this.objTemp.next;
      this.objTemp.next = 0;
      delete this.objTemp.result;
    } else {
      this.courant = 0;
      this.objTemp = { orgObject: { ...obj } };
    }

    if (this.objTemp.orgObject.source.fileId) {
      this.estGoogleDrive = true;
      this.urlFichier = `https://www.googleapis.com/drive/v3/files/${this.objTemp.orgObject.source.fileId}?supportsAllDrives=true`;
      this.urlTelechargement = `${this.urlFichier}&alt=media`;
    } else {
      this.estGoogleDrive = false;
      this.urlTelechargement = this.objTemp.orgObject.source.url;
    }
    
    this.debutTemps = Date.now();
    this.limiteTemps = 300 * 1000; // 5 minutes
    this.auth = `Bearer ${this.objTemp.orgObject.accessToken || ScriptApp.getOAuthToken()}`;
    this.tailleChunk = 16777216; // 16 MB
  }

  executer() {
    if (this.courant === 0) {
      this._recupererMetadonnees();
      this._calculerChunks();
      this._obtenirLocation();
    }
    this._telechargerEtEnvoyer();
    return this.objTemp.result;
  }

  _recupererMetadonnees() {
    if (this.estGoogleDrive) {
      const res = UrlFetchApp.fetch(`${this.urlFichier}&fields=mimeType%2Csize`, { headers: { authorization: this.auth } });
      const obj = JSON.parse(res.getContentText());
      if (obj.mimeType.includes("application/vnd.google-apps")) {
        throw new Error("Impossible d'uploader des fichiers Google natifs (Docs, Sheets...). Convertissez-les d'abord.");
      }
      this.objTemp.orgObject.source.mimeType = obj.mimeType;
      this.objTemp.orgObject.source.size = obj.size;
      return;
    }
    const res = UrlFetchApp.fetch(this.urlTelechargement, { muteHttpExceptions: true, headers: { Range: "bytes=0-1" } });
    if (res.getResponseCode() !== 206) throw new Error("Ce fichier ne supporte pas le téléchargement résumable.");
    const headers = res.getHeaders();
    const range = headers["Content-Range"].split("/");
    this.objTemp.orgObject.source.size = Number(range[1]);
  }

  _calculerChunks() {
    const taille = this.objTemp.orgObject.source.size;
    const nbChunks = Math.ceil(taille / this.tailleChunk);
    this.objTemp.chunks = [...Array(nbChunks)].map((_, i) => [
      i * this.tailleChunk,
      i === nbChunks - 1 ? taille - 1 : (i + 1) * this.tailleChunk - 1
    ]);
  }

  _obtenirLocation() {
    const options = {
      payload: JSON.stringify(this.objTemp.orgObject.destination.metadata),
      contentType: "application/json",
      muteHttpExceptions: true
    };
    if (!this.objTemp.orgObject.destination.uploadUrl.includes("key=")) {
       options.headers = { authorization: this.auth };
    }
    const res = UrlFetchApp.fetch(this.objTemp.orgObject.destination.uploadUrl, options);
    if (res.getResponseCode() !== 200) throw new Error(res.getContentText());
    this.objTemp.location = res.getAllHeaders()["Location"];
  }

  _telechargerEtEnvoyer() {
    const len = this.objTemp.chunks.length;
    for (let i = this.courant; i < len; i++) {
      const [debut, fin] = this.objTemp.chunks[i];
      const octetsCourants = `${debut}-${fin}`;
      
      const paramsDL = { headers: { range: `bytes=${octetsCourants}` }, muteHttpExceptions: true };
      if (this.estGoogleDrive) paramsDL.headers.authorization = this.auth;
      
      const blobPartiel = UrlFetchApp.fetch(this.urlTelechargement, paramsDL).getContent();
      
      const paramsUP = {
        headers: { "Content-Range": `bytes ${octetsCourants}/${this.objTemp.orgObject.source.size}` },
        payload: blobPartiel,
        muteHttpExceptions: true
      };
      
      const resUP = UrlFetchApp.fetch(this.objTemp.location, paramsUP);
      
      if (resUP.getResponseCode() === 200) {
        this.objTemp.result = JSON.parse(resUP.getContentText());
        this.proprietes.deleteProperty("upload_next");
      } else if (resUP.getResponseCode() !== 308) {
        throw new Error(resUP.getContentText());
      }

      if ((Date.now() - this.debutTemps) > this.limiteTemps) {
        this.objTemp.next = i + 1;
        this.proprietes.setProperty("upload_next", JSON.stringify(this.objTemp));
        console.warn("Temps limite atteint. Relancez le script pour continuer l'upload.");
        break;
      }
    }
  }
}
