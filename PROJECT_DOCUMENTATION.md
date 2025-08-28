# 📖 Documentation Complète du Projet Zed

Ce document fournit une analyse détaillée de l'architecture, de la structure et des composants clés du projet Zed. Il est conçu pour aider les nouveaux développeurs à comprendre rapidement la base de code.

## 📝 Table des Matières

- [1. Architecture Générale](#1-architecture-générale)
- [2. Arborescence du Projet](#2-arborescence-du-projet)
- [3. Analyse des Dossiers Principaux](#3-analyse-des-dossiers-principaux)
- [4. Analyse des Fichiers Critiques](#4-analyse-des-fichiers-critiques)
- [5. Analyse des Composants Clés (Crates)](#5-analyse-des-composants-clés-crates)
- [6. Tableau Récapitulatif des Modules](#6-tableau-récapitulatif-des-modules)
- [7. Deep Dive: Opérations sur le Système de Fichiers](#7-deep-dive-opérations-sur-le-système-de-fichiers)
- [8. Spécification Technique: Intégration d'un Agent IA](#8-spécification-technique-intégration-dun-agent-ia)
  - [8.1. Le Protocole ACP (Agent Client Protocol)](#81-le-protocole-acp-agent-client-protocol)
  - [8.2. Structure des Messages ACP](#82-structure-des-messages-acp)
  - [8.3. Spécification de la Commande `edit_file`](#83-spécification-de-la-commande-edit_file)
  - [8.4. Workflow de Confirmation et Gestion des Erreurs](#84-workflow-de-confirmation-et-gestion-des-erreurs)
  - [8.5. Guide Pratique: Créer un Faux Serveur LLM](#85-guide-pratique-créer-un-faux-serveur-llm)
- [9. Conclusion et Améliorations Possibles](#9-conclusion-et-améliorations-possibles)

---

## 1. Architecture Générale

Le projet Zed est un **monorepo Rust** structuré autour d'un **espace de travail (workspace) Cargo**. Cette approche centralise tout le code, y compris le cœur de l'éditeur, les extensions et les outils, dans un seul et même dépôt Git.

L'architecture peut être décrite comme une application **modulaire et pilotée par les événements**, construite sur un **framework d'interface utilisateur (UI) personnalisé et performant**.

Les piliers de l'architecture sont :

1.  **`gpui` (GPU-accelerated UI)** : Le framework UI maison, responsable de tout le rendu, de la gestion des fenêtres et des événements.
2.  **`project`** : Le modèle de données, gérant l'accès aux fichiers, Git et les serveurs de langage (LSP).
3.  **`workspace`** : Le contrôleur de fenêtre, orchestrant les panneaux (`Pane`), les docks, et les "items".
4.  **`editor`** : La vue principale pour l'édition de texte.

---

## 2. Arborescence du Projet

```
.
├── 📄 Cargo.toml
├── 🖼️ assets/
├── 📦 crates/
│   ├── 🚀 zed/
│   ├── 🎨 gpui/
│   ├── 🪟 workspace/
│   ├── ✍️ editor/
│   ├── 📂 project/
│   └── ...
├── 📚 docs/
├── 🧩 extensions/
├── 📜 script/
└── 🔬 tooling/
```

---

## 3. Analyse des Dossiers Principaux
*(Cette section reste inchangée, voir les versions précédentes pour le détail)*

---

## 4. Analyse des Fichiers Critiques
*(Cette section reste inchangée, voir les versions précédentes pour le détail)*

---

## 5. Analyse des Composants Clés (Crates)
*(Cette section reste inchangée, voir les versions précédentes pour le détail)*

---

## 6. Tableau Récapitulatif des Modules
*(Cette section reste inchangée, voir les versions précédentes pour le détail)*

---

## 7. Deep Dive: Opérations sur le Système de Fichiers
*(Cette section reste inchangée, voir les versions précédentes pour le détail)*

---

## 8. Spécification Technique: Intégration d'un Agent IA

Ce chapitre fournit les informations techniques nécessaires pour construire un serveur externe (par exemple, un faux LLM en Node.js) capable de communiquer avec Zed pour effectuer des modifications de fichiers.

### 8.1. Le Protocole ACP (Agent Client Protocol)

La communication entre Zed et ses agents IA (outils CLI externes) n'est **pas** directement une API REST de type OpenAI. Zed utilise un protocole intermédiaire appelé **Agent Client Protocol (ACP)**, qui fonctionne sur `stdin`/`stdout` avec des messages **JSON-RPC**.

Le flux correct est le suivant :
1.  **Zed** lance un outil CLI (l'agent, par exemple `@zed-ai/ucf`) en tant que sous-processus.
2.  Cet **outil CLI** est responsable de contacter une API externe (comme OpenAI, ou votre faux serveur).
3.  Votre **faux serveur** répond au CLI avec une réponse au format OpenAI standard (incluant des `tool_calls`).
4.  L'**outil CLI** reçoit cette réponse et la **traduit** en un message au format **ACP**.
5.  L'**outil CLI** écrit ce message ACP sur son `stdout`.
6.  **Zed** lit ce message ACP et exécute l'action demandée.

L'erreur courante est de croire que Zed consomme directement le format OpenAI. En réalité, il ne consomme que le format ACP.

### 8.2. Structure des Messages ACP

Le protocole est basé sur JSON-RPC 2.0. Voici les messages clés :

-   **`session/update`** : Notification envoyée par l'agent à Zed pour signaler un événement. C'est le message principal utilisé pour les `tool_calls`.

**Exemple de message ACP pour un `tool_call` :**
```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123def456",
    "update": {
      "sessionUpdate": "tool_call",
      "toolCallId": "call_001",
      "title": "Édition du fichier de configuration",
      "kind": "edit",
      "status": "pending",
      "content": [
        {
          "type": "diff",
          "path": "/chemin/absolu/vers/le/fichier.js",
          "oldText": "contenu original",
          "newText": "nouveau contenu"
        }
      ]
    }
  }
}
```
Le champ `content` de type `diff` est crucial pour les modifications de fichiers.

### 8.3. Spécification de la Commande `edit_file`

Lorsque l'agent CLI traduit un `tool_call` OpenAI en ACP, il se base sur la structure de l'outil `edit_file`. Voici les règles de validation strictes appliquées par Zed, trouvées dans `crates/assistant_tools/src/edit_file_tool.rs` :

| Champ | Type | Obligatoire ? | Description |
| :--- | :--- | :--- | :--- |
| `display_description` | `string` | **Oui** | Description de l'édition, affichée dans l'UI. Doit apparaître en premier dans le JSON. |
| `path` | `string` | **Oui** | Chemin relatif à la racine du projet. |
| `mode` | `string` | **Oui** | Valeurs possibles : `"create"`, `"overwrite"`, `"edit"`. |
| `content` | `string` | **Oui** (si mode=`create`\|`overwrite`) | Le contenu complet du fichier. |
| `old_text` | `string` | **Oui** (si mode=`edit`) | Le contenu à remplacer (pour un patch). |
| `new_text` | `string` | **Oui** (si mode=`edit`) | Le nouveau contenu (pour un patch). |

**Multiples `tool_calls` :** Pour modifier plusieurs fichiers, le LLM doit renvoyer un tableau `tool_calls` contenant plusieurs objets, chacun avec un `index` unique.

### 8.4. Workflow de Confirmation et Gestion des Erreurs

-   **Confirmation :** Zed peut demander une confirmation à l'utilisateur avant d'appliquer une modification si le chemin est sensible (par exemple, dans `.zed/` ou en dehors du projet). L'agent peut initier cette demande via la méthode ACP `session/request_permission`.
-   **Gestion des erreurs :** Si une modification échoue (par exemple, le fichier est vidé), c'est souvent dû à un `tool_call` mal formé ou à un problème dans la traduction OpenAI -> ACP par le CLI. Les logs de Zed sont le meilleur endroit pour diagnostiquer ces erreurs.

### 8.5. Guide Pratique: Créer un Faux Serveur LLM

#### 1. Où Trouver et Modifier l'Outil CLI
Les agents CLI sont téléchargés par Zed dans :
-   **macOS :** `~/.zed/agents/`
-   **Linux :** `~/.config/zed/agents/`
-   **Windows :** `%APPDATA%\zed\agents\`

Chaque dossier (par exemple, `@zed-ai/openai`) contient une application Node.js. Pour utiliser votre faux serveur, vous devez modifier le fichier `index.js` de l'agent :
```javascript
// Contenu typique de l'agent CLI
// ...
const baseURL = "https://api.openai.com"; // <-- LIGNE À MODIFIER

// MODIFICATION REQUISE :
const baseURL = "http://localhost:3000"; // <-- URL de votre serveur local
// ...
```

#### 2. Code du Faux Serveur Node.js
Ce serveur simule une réponse OpenAI qui demande l'édition de deux fichiers.
```javascript
const http = require('http');

const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const toolCalls = [
            {
                index: 0,
                id: `call_${Date.now()}_1`,
                type: "function",
                function: {
                    name: "edit_file",
                    arguments: JSON.stringify({
                        display_description: "Update test.js",
                        path: "test.js",
                        mode: "overwrite",
                        content: `console.log("Hello from test.js at ${new Date().toLocaleTimeString()}");`
                    })
                }
            },
            {
                index: 1,
                id: `call_${Date.now()}_2`,
                type: "function",
                function: {
                    name: "edit_file",
                    arguments: JSON.stringify({
                        display_description: "Update test2.js",
                        path: "test2.js",
                        mode: "overwrite",
                        content: `console.log("Hello from test2.js at ${new Date().toLocaleTimeString()}");`
                    })
                }
            }
        ];

        const payload = {
            id: `chatcmpl-${Date.now()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: "gpt-4",
            choices: [{
                index: 0,
                delta: { tool_calls: toolCalls },
                finish_reason: null
            }]
        };

        const finalChunk = {
            id: payload.id,
            object: "chat.completion.chunk",
            created: payload.created,
            model: payload.model,
            choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }]
        };

        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
    } else {
        res.writeHead(404).end();
    }
});

server.listen(3000, () => console.log('Fake OpenAI server for Zed running on http://localhost:3000'));
```

#### 3. Débogage
-   **Logs de Zed :** `Help > Show Logs`. Cherchez des erreurs de parsing ACP.
-   **Logs du CLI :** Lancez Zed depuis un terminal pour voir la sortie `stdout` de l'agent.
-   **Tester le serveur :** Utilisez `curl` pour vérifier que votre serveur renvoie le bon format SSE.

---

## 9. Conclusion et Améliorations Possibles

### Conclusion
Zed est un projet d'ingénierie logicielle impressionnant, caractérisé par :
-   Une **architecture Rust robuste et modulaire** (workspace).
-   Un **framework UI propriétaire (`gpui`)** qui est au cœur de ses performances et de son expérience utilisateur.
-   Une **séparation claire des responsabilités** entre le modèle (`project`), la vue (`editor`) et le contrôleur (`workspace`).
-   Une **forte extensibilité**, avec un système d'extensions qui est lui-même une partie intégrante du projet.

### Améliorations Possibles
-   **Documentation interne :** Bien que le code soit bien structuré, de nombreux crates plus petits manquent de documentation de haut niveau, ce qui peut rendre leur découverte difficile.
-   **Complexité d'entrée :** La taille du monorepo et le grand nombre de crates peuvent être intimidants pour un nouveau contributeur. Un guide de contribution plus détaillé sur "où commencer" pourrait être utile.
-   **Dépendances "forkées" :** L'utilisation de versions patchées de certaines dépendances (via `[patch.crates-io]`) peut compliquer la maintenance et la mise à jour. Il serait bon de documenter pourquoi ces forks sont nécessaires.
-   **Configuration de l'édition Rust :** L'utilisation de `edition = "2024"` est avant-gardiste et nécessite une toolchain `nightly`. Cela devrait être clairement indiqué dans le `README.md` principal pour éviter toute confusion lors de la mise en place de l'environnement de développement.
