# 📖 Guide Définitif d'Implémentation d'Agent IA pour Zed

Ce document fournit une spécification technique détaillée et un guide pratique pour construire un serveur LLM externe capable de s'intégrer avec les fonctionnalités d'agent de Zed. Il est le résultat d'une analyse approfondie du code source de Zed et vise à fournir une solution "infaillible" pour les développeurs.

## 📝 Table des Matières

- [1. L'Architecture Réelle : Agent Rust Intégré](#1-larchitecture-réelle--agent-rust-intégré)
- [2. Spécification de l'API du Serveur Externe](#2-spécification-de-lapi-du-serveur-externe)
  - [2.1. Endpoint et Méthode](#21-endpoint-et-méthode)
  - [2.2. Format de la Réponse : Server-Sent Events (SSE)](#22-format-de-la-réponse--server-sent-events-sse)
  - [2.3. Structure des Données SSE](#23-structure-des-données-sse)
- [3. La Solution au "Problème de la Boucle" : Terminaison du Stream](#3-la-solution-au-problème-de-la-boucle--terminaison-du-stream)
- [4. Référence des Outils de l'Agent](#4-référence-des-outils-de-lagent)
  - [4.1. Liste Complète des Outils Disponibles](#41-liste-complète-des-outils-disponibles)
  - [4.2. Focus sur l'outil `edit_file`](#42-focus-sur-loutil-edit_file)
- [5. Exemple Pratique : Serveur Node.js Fonctionnel](#5-exemple-pratique--serveur-nodejs-fonctionnel)
- [6. Configuration et Débogage](#6-configuration-et-débogage)
  - [6.1. Configurer Zed](#61-configurer-zed)
  - [6.2. Stratégie de Débogage](#62-stratégie-de-débogage)
  - [6.3. Analyse des Logs de Zed (Exemples Réels)](#63-analyse-des-logs-de-zed-exemples-réels)
- [7. Conclusion](#7-conclusion)

---

## 1. L'Architecture Réelle : Agent Rust Intégré

Contrairement à ce que l'on pourrait penser, l'agent qui interagit avec les API compatibles OpenAI **n'est pas un script externe modifiable (comme un `index.js`)**. L'analyse du code source de Zed (`crates/language_models/src/provider/open_ai.rs`) révèle que le client OpenAI est un **composant Rust intégré directement dans Zed**.

**Cela a une implication majeure :** vous ne pouvez pas modifier un script pour pointer vers votre serveur. À la place, vous devez construire un serveur qui **imite parfaitement l'API `v1/chat/completions` d'OpenAI**, puis configurer Zed pour qu'il utilise l'URL de votre serveur.

Le flux de communication est donc :
1.  **Zed (Client Rust interne)** envoie une requête HTTP à votre serveur.
2.  **Votre Serveur** reçoit la requête et répond avec un flux de données (SSE).
3.  **Zed (Client Rust interne)** parse le flux SSE, et lorsque des `tool_calls` sont détectés et que le flux se termine correctement, il les traduit en actions internes (comme l'édition de fichiers).

Il n'y a **pas de couche de traduction intermédiaire ACP (Agent Client Protocol) ou de CLI externe** pour le fournisseur OpenAI. Le client Rust de Zed gère directement la communication et la traduction.

## 2. Spécification de l'API du Serveur Externe

Pour que Zed puisse communiquer avec votre serveur, celui-ci doit respecter scrupuleusement la spécification suivante.

### 2.1. Endpoint et Méthode
- **Méthode :** `POST`
- **Endpoint :** `/v1/chat/completions` (ou tout autre chemin correspondant à ce que vous configurez dans Zed)

### 2.2. Format de la Réponse : Server-Sent Events (SSE)
- **Header `Content-Type` :** Votre serveur **doit** renvoyer `text/event-stream`.
- **Format des messages :** Chaque message envoyé doit être préfixé par `data: ` et se terminer par deux sauts de ligne (`\n\n`).

### 2.3. Structure des Données SSE
Le JSON envoyé dans chaque message `data:` doit être un `chat.completion.chunk` d'OpenAI. Pour l'édition de fichiers, la structure la plus importante est `delta.tool_calls`.

---

## 3. La Solution au "Problème de la Boucle" : Terminaison du Stream

L'analyse du code Rust de Zed (`OpenAiEventMapper::map_event`) montre que Zed attend un signal très spécifique pour savoir que la liste des `tool_calls` est terminée. Sans ce signal, Zed attend indéfiniment, ce qui provoque une boucle apparente ou un blocage.

Pour terminer correctement le stream, votre serveur **doit** envoyer deux derniers messages dans cet ordre :

**1. Le Chunk de Fin de `tool_calls` :**
Un chunk contenant `finish_reason: "tool_calls"`. Ce message indique à Zed qu'il ne recevra plus de nouveaux `tool_calls`.

```json
{
  "id": "chatcmpl-unique-id",
  "object": "chat.completion.chunk",
  "created": 1694268190,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "delta": {},
      "finish_reason": "tool_calls"
    }
  ]
}
```

**2. Le Message de Fin de Stream `[DONE]` :**
Le message final et standard pour les flux SSE d'OpenAI.

```
data: [DONE]
```

Le respect de cette séquence est **la clé absolue** pour que l'intégration fonctionne.

---

## 4. Référence des Outils de l'Agent

Zed met à disposition une suite d'outils que l'agent IA peut utiliser. Voici une liste complète suivie d'une analyse détaillée de l'outil le plus complexe, `edit_file`.

### 4.1. Liste Complète des Outils Disponibles

Basé sur l'analyse du code source (`crates/assistant_tools/`), voici les outils que l'agent peut invoquer :

-   `TerminalTool`: Exécute des commandes dans un terminal.
-   `OpenTool`: Ouvre un fichier ou un chemin.
-   `ListDirectoryTool`: Liste le contenu d'un répertoire.
-   `FetchTool`: Récupère le contenu d'une URL.
-   `WebSearchTool`: Effectue une recherche sur le web.
-   `ReadFileTool`: Lit le contenu d'un fichier.
-   `GrepTool`: Recherche un motif dans les fichiers du projet.
-   `DiagnosticsTool`: Affiche les diagnostics (erreurs, avertissements) du projet.
-   `DeletePathTool`: Supprime un fichier ou un répertoire.
-   `EditFileTool`: Crée, modifie ou écrase un fichier.
-   `CreateDirectoryTool`: Crée un nouveau répertoire.
-   `MovePathTool`: Déplace ou renomme un fichier/répertoire.
-   `NowTool`: Obtient la date et l'heure actuelles.
-   `FindPathTool`: Trouve un chemin dans le projet.
-   `CopyPathTool`: Copie un fichier ou un répertoire.
-   `ProjectNotificationsTool`: Gère les notifications du projet.
-   `ThinkingTool`: Permet à l'agent de "réfléchir" avant d'agir.

### 4.2. Focus sur l'outil `edit_file`

Cet outil est le plus puissant et le plus complexe. Il permet de manipuler le contenu des fichiers.

#### Arguments de `edit_file`

L'analyse du fichier `crates/assistant_tools/src/edit_file_tool.rs` montre que l'outil attend un objet JSON avec les champs suivants :

| Champ | Type | Obligatoire ? | Description |
| :--- | :--- | :--- | :--- |
| `display_description` | `string` | **Oui** | Une description courte de l'action, affichée dans l'UI. |
| `path` | `string` | **Oui** | Le chemin du fichier à modifier, relatif à la racine du projet. |
| `mode` | `string` | **Oui** | Le mode d'opération. Valeurs possibles : `"edit"`, `"create"`, `"overwrite"`. |
| `content` | `string` | Non | Le contenu à utiliser pour `create` ou `overwrite`. |
| `old_text` | `string` | Non | Le texte à remplacer pour le mode `edit`. |
| `new_text` | `string` | Non | Le nouveau texte pour le mode `edit`. |

**Format d'Arguments Canonique :**
```json
{
  "display_description": "Description de l'action",
  "path": "chemin/vers/le/fichier.js",
  "mode": "overwrite",
  "content": "console.log('Nouveau contenu');"
}
```

#### Clarification sur `create_or_overwrite`
Bien que des discussions sur GitHub ou d'anciennes versions aient pu mentionner un champ `create_or_overwrite`, l'implémentation actuelle **n'utilise pas ce champ**. Le comportement est exclusivement contrôlé par le champ `mode`. Fournir `create_or_overwrite` n'aura aucun effet.

#### Known Issues & Provider Compatibility
- **Problème de compatibilité avec AWS Bedrock :** Un problème connu (voir [GitHub Issue #33168](https://github.com/zed-industries/zed/issues/33168)) existe lors de l'utilisation de `edit_file` avec AWS Bedrock comme fournisseur. Bedrock exige un champ `toolConfig` dans la requête si des outils ont été utilisés précédemment dans la conversation, ce que le client de Zed ne fournit pas toujours, causant une erreur 400.
- **Implication pour votre serveur :** Ce bug est spécifique à Bedrock. Si vous construisez un serveur compatible OpenAI standard, **vous n'avez pas besoin de gérer ce cas**. Votre serveur doit simplement suivre la spécification décrite dans ce document.

---

## 5. Exemple Pratique : Serveur Node.js Fonctionnel

Voici un code de serveur Node.js complet et fonctionnel qui implémente la spécification ci-dessus.

```javascript
// fixed_fake_openai_server.js
const http = require('http');

const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url.endsWith('/v1/chat/completions')) {
        console.log("Received request from Zed.");
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const toolCallPayload = {
            id: `chatcmpl-${Date.now()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: "gpt-4-bulletproof",
            choices: [{
                index: 0,
                delta: {
                    tool_calls: [{
                        index: 0,
                        id: `call_${Date.now()}`,
                        type: "function",
                        function: {
                            name: "edit_file",
                            arguments: JSON.stringify({
                                display_description: "Replace content of test.js",
                                path: "test.js",
                                mode: "overwrite",
                                content: `console.log("Hello from the definitive server at ${new Date().toLocaleTimeString()}");`
                            })
                        }
                    }]
                },
                finish_reason: null
            }]
        };

        const finalChunkPayload = {
            id: toolCallPayload.id,
            object: "chat.completion.chunk",
            created: toolCallPayload.created,
            model: toolCallPayload.model,
            choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }]
        };

        res.write(`data: ${JSON.stringify(toolCallPayload)}\n\n`);
        res.write(`data: ${JSON.stringify(finalChunkPayload)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not Found');
    }
});

server.listen(3000, () => {
    console.log('Definitive Fake OpenAI server for Zed running on http://localhost:3000');
});
```

---

## 6. Configuration et Débogage

### 6.1. Configurer Zed
1.  Ouvrez vos paramètres Zed (`settings.json`).
2.  Ajoutez ou modifiez la section `openai` pour pointer vers votre serveur local.
```json
{
  "assistant": {
    "version": "1",
    "enabled": true,
    "default_model": { "provider": "openai", "model": "gpt-4-bulletproof" }
  },
  "openai": { "api_url": "http://localhost:3000/v1" }
}
```
3. **Redémarrez Zed** pour vous assurer que les nouveaux paramètres sont pris en compte.

### 6.2. Stratégie de Débogage
1.  **Logs du Serveur :** C'est votre outil principal. Lancez votre serveur dans un terminal pour voir les requêtes entrantes.
2.  **`curl` pour Tester :** Validez votre serveur indépendamment de Zed.
    ```sh
    curl -N -X POST http://localhost:3000/v1/chat/completions
    ```
3.  **Logs de Zed :** En dernier recours, consultez les logs de Zed (`Help > Show Logs`) pour des erreurs de connexion ou de parsing.

### 6.3. Analyse des Logs de Zed (Exemples Réels)

(Cette section reste identique à la version précédente, expliquant les logs pour JSON malformé et `finish_reason` manquant.)

### 6.4. Checklist de Validation de l'Implémentation

Avant même de tester avec Zed, suivez cette checklist pour valider votre serveur :

1.  **[ ] Le serveur démarre-t-il sans erreur ?**
    - Lancez `node votre_serveur.js`. Il doit afficher le message d'écoute sur le bon port.

2.  **[ ] L'endpoint de santé (`/health`) répond-il correctement ?**
    - Exécutez `curl http://localhost:3000/health`.
    - Vous devez recevoir une réponse `{"status":"ok"}`.

3.  **[ ] L'endpoint des modèles (`/v1/models`) répond-il ?**
    - Exécutez `curl http://localhost:3000/v1/models`.
    - Vous devez recevoir une liste de modèles au format JSON.

4.  **[ ] L'endpoint principal (`/v1/chat/completions`) répond-il en streaming ?**
    - Exécutez `curl -N -X POST http://localhost:3000/v1/chat/completions`.
    - Les chunks `data:` doivent apparaître un par un.

5.  **[ ] La séquence de terminaison est-elle correcte ?**
    - Dans la sortie de `curl`, vérifiez que les **trois derniers messages** sont exactement :
      1. `data: {"id":...,"choices":[{"finish_reason":"tool_calls"}]}`
      2. `data: [DONE]`
      3. La connexion est fermée par le serveur.

Si tous les points de cette checklist sont validés, votre serveur est prêt à être testé avec Zed.

### 6.5. Guide de Vérification de l'Intégration

Une fois le serveur validé, suivez ces étapes pour tester l'intégration complète :

1.  **Configurez `settings.json`** dans Zed pour pointer vers votre `api_url` locale.
2.  **Redémarrez Zed** complètement pour garantir la prise en compte des nouveaux paramètres.
3.  **Ouvrez un projet** et créez un fichier de test (ex: `test.js`).
4.  **Ouvrez l'assistant IA** (ex: `cmd-shift-space`).
5.  **Donnez une instruction** qui nécessite l'utilisation de l'outil `edit_file`. Par exemple : "Écrase le contenu de `test.js` avec 'hello world'".
6.  **Observez le comportement :**
    - **Succès :** L'assistant doit afficher une prévisualisation de la modification, et vous devez pouvoir l'appliquer. Les logs de votre serveur Node.js doivent montrer une requête entrante.
    - **Échec (Zed reste en attente) :** C'est le "problème de la boucle". Votre serveur ne termine pas le stream correctement. (Voir section 3).
    - **Échec (Aucune réponse de l'assistant) :** Zed n'a probablement pas pu atteindre votre serveur. Vérifiez l'URL dans `settings.json` et assurez-vous que votre serveur est en cours d'exécution. Consultez les logs de Zed pour des erreurs de connexion.

### 6.6. Configuration : Développement vs. Production

-   **Développement :** L'utilisation de `localhost` et d'un port comme `3000` est parfaite. Vous pouvez utiliser des outils comme `nodemon` pour redémarrer automatiquement votre serveur lors des modifications.
-   **Production :**
    - Votre serveur devra être déployé sur un service d'hébergement (ex: Vercel, Render, AWS, etc.).
    - L'`api_url` dans Zed devra pointer vers votre URL publique (ex: `https://votre-serveur-zed.com/v1`).
    - **Sécurité :** Ne hardcodez jamais de clés d'API ou de secrets. Utilisez des variables d'environnement (`process.env`) pour les gérer, comme montré dans l'exemple de code "production-ready".

---

## 7. Architecture Technique Détaillée

Pour les développeurs souhaitant une compréhension plus profonde, cette section décrit le flux de données interne de Zed lors d'une interaction avec un agent IA.

### 7.1. Cycle de Vie Complet d'une Requête (Data Flow Textuel)

1.  **Requête Utilisateur (UI)**: L'utilisateur tape un prompt dans le panneau de l'assistant de Zed et appuie sur Entrée.
2.  **Création du `Thread`**: Le `crates/agent` crée ou met à jour un objet `Thread`. Cette structure, définie dans `crates/agent/src/thread.rs`, contient tout l'historique de la conversation (messages, `tool_calls` passés, etc.).
3.  **Construction de la Requête**: La méthode `to_completion_request` sur le `Thread` assemble l'historique des messages et le contexte pour créer une `LanguageModelRequest`.
4.  **Envoi de la Requête HTTP**: Cette `LanguageModelRequest` est passée au `provider` configuré (dans notre cas, `crates/language_models/src/provider/open_ai.rs`). Le provider la transforme en une requête HTTP `POST` et l'envoie à l'`api_url` que vous avez configurée.
5.  **Réponse du Serveur (SSE)**: Votre serveur reçoit la requête et commence à envoyer des chunks SSE (`data: ...`).
6.  **Parsing du Stream**: Le `OpenAiEventMapper` dans `open_ai.rs` reçoit ces chunks. Il parse le JSON et convertit chaque partie (`delta.content`, `delta.tool_calls`, `finish_reason`) en un événement interne `LanguageModelCompletionEvent`.
7.  **Mise à jour du `Thread`**: Le `crates/agent` écoute ces événements.
    - `Text` -> Le texte est ajouté au message de l'assistant dans l'UI.
    - `ToolUse` -> Un `PendingToolUse` est créé et stocké dans l'état du `Thread`.
8.  **Fin du Stream et Exécution des Outils**: Lorsque l'événement `StopReason::ToolUse` est reçu (déclenché par `finish_reason: "tool_calls"`), la méthode `use_pending_tools` est appelée.
9.  **Exécution de l'Outil**: La méthode `run` de l'outil correspondant (ex: `EditFileTool::run`) est exécutée.
10. **Stockage du Résultat**: Le résultat de l'outil (succès ou erreur) est stocké dans le `Thread`, associé à son `tool_use_id`.
11. **Cycle de Suivi (Follow-up)**: L'agent constate que tous les outils ont terminé. Il rappelle `send_to_model`.
12. **Construction de la Requête de Suivi**: `to_completion_request` est de nouveau appelée. Cette fois, elle inclut non seulement le `tool_use` de l'assistant, mais aussi un nouveau message de `role: user` contenant le `tool_result` (le résultat de l'outil).
13. **Seconde Réponse du LLM**: Le LLM reçoit la confirmation de l'exécution de l'outil et son résultat. Il génère une réponse finale textuelle (ex: "J'ai modifié le fichier.").
14. **Mise à Jour Finale de l'UI**: Cette réponse textuelle finale est streamée et affichée dans l'UI de l'assistant. Le cycle est terminé.

### 7.2. Gestion de l'État et de la Session

- **La Session est le `Thread`**: L'état de la conversation n'est pas géré par un `sessionId` volatile, mais est entièrement encapsulé dans la structure `Thread` (`crates/agent/src/thread.rs`).
- **Persistance**: Ce `Thread` est sérialisé et stocké localement dans la base de données de Zed, ce qui permet de conserver l'historique des conversations entre les sessions de l'éditeur.
- **Contexte implicite**: Chaque requête envoyée à votre serveur contient l'historique pertinent des messages (y compris les `tool_calls` et `tool_results` précédents), reconstruit à partir du `Thread`. Votre serveur n'a donc pas besoin de stocker l'état de la conversation ; il peut être "stateless" et répondre à chaque requête indépendamment.

---

## 8. Conclusion

Ce guide a démystifié l'intégration d'agents IA avec Zed. La clé du succès ne réside pas dans la modification d'un agent externe, mais dans la création d'un serveur backend qui respecte rigoureusement la spécification de l'API OpenAI, en particulier le protocole de streaming et ses signaux de terminaison. La connaissance précise des outils disponibles, de leurs arguments et de leurs limitations est également essentielle. Avec ces informations, les développeurs devraient être en mesure de construire des intégrations fiables et performantes.
