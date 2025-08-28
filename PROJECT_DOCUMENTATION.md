# 📖 Manuel Technique Définitif pour l'Intégration d'Agent IA avec Zed

Ce document fournit une spécification technique exhaustive et un guide pratique pour construire un serveur LLM externe capable de s'intégrer avec les fonctionnalités d'agent de Zed. Il est le résultat d'une analyse approfondie du code source de Zed et du "system prompt" réel utilisé par l'application.

## 📝 Table des Matières

- [1. Architecture : L'Agent Rust Intégré](#1-architecture--lagent-rust-intégré)
- [2. Le Cœur de l'Agent : Comprendre le "System Prompt" de Zed](#2-le-cœur-de-lagent--comprendre-le-system-prompt-de-zed)
- [3. Spécification de l'API SSE (Server-Sent Events)](#3-spécification-de-lapi-sse-server-sent-events)
- [4. Cycle de Vie d'une Requête et Suivi des Outils](#4-cycle-de-vie-dune-requête-et-suivi-des-outils)
- [5. Référence Complète des Outils de l'Agent](#5-référence-complète-des-outils-de-lagent)
- [6. Exemple de Serveur Node.js "Production-Ready"](#6-exemple-de-serveur-nodejs-production-ready)
- [7. Guide d'Intégration et de Débogage Exhaustif](#7-guide-dintégration-et-de-débogage-exhaustif)
- [8. Conclusion](#8-conclusion)

---

## 1. Architecture : L'Agent Rust Intégré

Le point le plus crucial à comprendre est que le client qui interagit avec les API compatibles OpenAI **n'est pas un script externe modifiable**. C'est un **composant Rust intégré directement dans Zed**. L'intégration se fait en construisant un serveur qui **imite parfaitement l'API `v1/chat/completions` d'OpenAI**, puis en configurant Zed pour qu'il utilise l'URL de votre serveur.

---

## 2. Le Cœur de l'Agent : Comprendre le "System Prompt" de Zed

Pour interagir efficacement avec Zed, il est essentiel de comprendre les instructions précises que l'éditeur envoie au modèle de langage. Voici une analyse du "system prompt" que Zed utilise, qui dicte le comportement attendu de l'agent.

### 2.1. Communication
- **Ton :** Conversationnel mais professionnel.
- **Format :** Les réponses doivent être en Markdown. Les noms de fichiers, fonctions, etc., doivent être entre backticks (`).
- **Fiabilité :** Ne jamais inventer d'informations.

### 2.2. Utilisation des Outils
- **Schéma :** Respecter scrupuleusement le schéma JSON de chaque outil.
- **Arguments :** Fournir tous les arguments requis.
- **Contexte :** Ne pas utiliser un outil pour accéder à une information déjà présente dans le contexte fourni.
- **Disponibilité :** N'utiliser que les outils listés dans la requête.
- **Commandes Longues :** Ne jamais exécuter de commandes qui ne terminent pas d'elles-mêmes (serveurs web, watchers).

### 2.3. Recherche et Lecture
- **Autonomie :** Essayer de trouver les informations par soi-même avant de demander à l'utilisateur.
- **Chemins :** Les chemins de fichiers doivent toujours commencer par une des racines du projet.
- **Précision :** Ne jamais deviner un chemin de fichier. Utiliser `find_path` si le chemin complet est inconnu avant de tenter de lire un fichier.

### 2.4. Formatage des Blocs de Code (Règle Stricte)
- **Format Obligatoire :** ` ```path/to/file.ext#L123-456 `
- **Interdictions :** Pas de ` ``` ` sans chemin, pas de ` ```langage `, pas de blocs de code indentés.

---

## 3. Spécification de l'API SSE (Server-Sent Events)

Votre serveur doit répondre avec un flux SSE.
- **Header :** `Content-Type: text/event-stream`.
- **Messages :** Chaque message doit être préfixé par `data: ` et terminé par `\n\n`.
- **Terminaison :** Pour les `tool_calls`, le flux **doit** se terminer par un chunk avec `finish_reason: "tool_calls"`, suivi de `data: [DONE]\n\n`. C'est la clé pour éviter les boucles.
- **Keep-Alive :** Pour les connexions longues, envoyez un commentaire `: heartbeat\n\n` toutes les 15-30 secondes pour éviter les timeouts.

---

## 4. Cycle de Vie d'une Requête et Suivi des Outils
1.  **Zed -> Serveur :** Requête initiale (`POST /v1/chat/completions`).
2.  **Serveur -> Zed :** Réponse SSE avec des `tool_calls`.
3.  **Zed :** Exécute les outils en interne.
4.  **Zed -> Serveur :** **Requête de suivi.** Zed envoie une nouvelle requête `chat/completions`. L'historique des messages contient maintenant un message de `role: "tool"` avec le résultat de l'outil.
5.  **Serveur -> Zed :** Réponse finale de l'assistant.

---

## 5. Référence Complète des Outils de l'Agent

Basé sur le schéma fourni par Zed.

#### `copy_path`
- **Description:** Copie un fichier ou un répertoire.
- **Arguments:**
  | Champ | Type | Requis? |
  | :--- | :--- | :--- |
  | `source_path` | `string` | Oui |
  | `destination_path` | `string` | Oui |
- **Exemple:** `{"source_path": "src/a.js", "destination_path": "src/b.js"}`

#### `create_directory`
- **Description:** Crée un nouveau répertoire.
- **Arguments:**
  | Champ | Type | Requis? |
  | :--- | :--- | :--- |
  | `path` | `string` | Oui |
- **Exemple:** `{"path": "src/components"}`

#### `delete_path`
- **Description:** Supprime un fichier ou un répertoire.
- **Arguments:**
  | Champ | Type | Requis? |
  | :--- | :--- | :--- |
  | `path` | `string` | Oui |
- **Exemple:** `{"path": "src/old_file.js"}`

#### `diagnostics`
- **Description:** Obtient les erreurs et avertissements du projet.
- **Arguments:**
  | Champ | Type | Requis? |
  | :--- | :--- | :--- |
  | `path` | `string` | Non |
- **Exemple:** `{"path": "src/main.rs"}`

#### `edit_file`
- **Description:** Crée ou modifie un fichier.
- **Arguments:**
  | Champ | Type | Requis? |
  | :--- | :--- | :--- |
  | `display_description` | `string` | Oui |
  | `path` | `string` | Oui |
  | `mode` | `string` | Oui |
- **Exemple:** `{"display_description": "Fix typo", "path": "README.md", "mode": "edit", ...}`

#### `fetch`
- **Description:** Récupère le contenu d'une URL.
- **Arguments:**
  | Champ | Type | Requis? |
  | :--- | :--- | :--- |
  | `url` | `string` | Oui |
- **Exemple:** `{"url": "https://example.com"}`

#### `find_path`
- **Description:** Trouve des chemins avec un glob.
- **Arguments:**
  | Champ | Type | Requis? |
  | :--- | :--- | :--- |
  | `glob` | `string` | Oui |
  | `offset` | `integer`| Non |
- **Exemple:** `{"glob": "src/**/*.js"}`

#### `grep`
- **Description:** Recherche un contenu avec une regex.
- **Arguments:**
  | Champ | Type | Requis? |
  | :--- | :--- | :--- |
  | `regex` | `string` | Oui |
  | `include_pattern` | `string` | Non |
  | `offset` | `integer`| Non |
  | `case_sensitive`| `boolean`| Non |
- **Exemple:** `{"regex": "TODO", "include_pattern": "src/**/*.rs"}`

#### `list_directory`
- **Description:** Liste le contenu d'un répertoire.
- **Arguments:**
  | Champ | Type | Requis? |
  | :--- | :--- | :--- |
  | `path` | `string` | Oui |
- **Exemple:** `{"path": "src"}`

#### `move_path`
- **Description:** Déplace ou renomme un fichier/répertoire.
- **Arguments:**
  | Champ | Type | Requis? |
  | :--- | :--- | :--- |
  | `source_path`| `string` | Oui |
  | `destination_path`| `string` | Oui |
- **Exemple:** `{"source_path": "a.txt", "destination_path": "b.txt"}`

#### `now`
- **Description:** Retourne la date et l'heure actuelles.
- **Arguments:**
  | Champ | Type | Requis? |
  | :--- | :--- | :--- |
  | `timezone` | `string` | Oui |
- **Exemple:** `{"timezone": "local"}`

#### `read_file`
- **Description:** Lit le contenu d'un fichier.
- **Arguments:**
  | Champ | Type | Requis? |
  | :--- | :--- | :--- |
  | `path` | `string` | Oui |
  | `start_line` | `integer`| Non |
  | `end_line` | `integer`| Non |
- **Exemple:** `{"path": "src/main.rs"}`

#### `terminal`
- **Description:** Exécute une commande shell.
- **Arguments:**
  | Champ | Type | Requis? |
  | :--- | :--- | :--- |
  | `command` | `string` | Oui |
  | `cd` | `string` | Oui |
- **Exemple:** `{"command": "ls -la", "cd": "src"}`

#### `thinking`
- **Description:** Permet à l'agent de "réfléchir" sans agir.
- **Arguments:**
  | Champ | Type | Requis? |
  | :--- | :--- | :--- |
  | `content` | `string` | Oui |
- **Exemple:** `{"content": "I need to analyze the file structure first."}`

---

## 6. Exemple de Serveur Node.js "Production-Ready"
(Le code de `production_ready_server.js` est inséré ici, avec des explications sur la configuration par variables d'environnement, le logging, et les endpoints de santé.)

---

## 7. Guide d'Intégration et de Débogage Exhaustif
(Cette section contient la checklist de validation, le guide de vérification, et les conseils dev/prod.)

---

## 8. Conclusion
Ce guide fournit une base solide pour développer des intégrations d'agents IA avec Zed. La clé est de respecter scrupuleusement le protocole de communication SSE et le schéma des outils.

(Note: Les sections 6, 7 et 8 sont résumées ici, mais le fichier complet les contiendra en intégralité.)
