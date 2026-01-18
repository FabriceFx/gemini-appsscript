# gemini-appsscript

![License MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Platform](https://img.shields.io/badge/Platform-Google%20Apps%20Script-green)
![Runtime](https://img.shields.io/badge/Google%20Apps%20Script-V8-green)
![Author](https://img.shields.io/badge/Auteur-Fabrice%20Faucheux-orange)

**[Français]**
Client Apps Script moderne (ES6+) pour l'API Gemini : uploads résumables, chat contextuel et appels de fonctions. Cette bibliothèque simplifie l'interaction avec les modèles multimodaux de Google (Gemini 1.5/2.0) en gérant nativement les fichiers Drive, les schémas JSON et les gros fichiers vidéo.

**[English]**
Modern Apps Script (ES6+) client for Gemini API: resumable uploads, contextual chat, and function calling. This library simplifies interaction with Google's multimodal models (Gemini 1.5/2.0) by natively handling Drive files, JSON schemas, and large video files.

---

## 🇫🇷 Documentation en Français

### ✨ Fonctionnalités Clés

* **Multimodalité native** : Traitez texte, images, audio, vidéo et PDF directement depuis Google Drive ou via des Blobs.
* **Uploads Résumables (Large Files)** : Gestion automatique des fichiers > 50 Mo via le protocole résumable, avec persistance de l'état (nécessaire pour les longues vidéos).
* **Sortie JSON Structurée** : Forcez le modèle à répondre selon un schéma JSON précis (idéal pour l'extraction de données type factures).
* **Mode Chat & Historique** : Gestion simplifiée de l'historique de conversation.
* **Appels de Fonctions (Function Calling)** : Exécutez des fonctions Apps Script (ex: envoyer un email, chercher dans Sheets) directement via l'IA.

### 📦 Installation

Cette bibliothèque est conçue pour être intégrée directement dans votre projet.

1.  Ouvrez votre projet **Google Apps Script**.
2.  Créez un fichier nommé `GeminiAvecFichiers.gs`.
3.  Copiez l'intégralité du code de la classe `GeminiAvecFichiers` dans ce fichier.
4.  Activez le service **PropertiesService** (activé par défaut) pour les uploads résumables.

### 🛠 Configuration

```javascript
const gemini = new GeminiAvecFichiers({
  cleApi: "VOTRE_CLE_API_GOOGLE_AI_STUDIO",
  modele: "models/gemini-2.0-flash", // ou gemini-1.5-pro
  version: "v1beta",
  temperature: 0.7
});
