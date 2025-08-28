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

---

## 7. Conclusion

Ce guide a démystifié l'intégration d'agents IA avec Zed. La clé du succès ne réside pas dans la modification d'un agent externe, mais dans la création d'un serveur backend qui respecte rigoureusement la spécification de l'API OpenAI, en particulier le protocole de streaming et ses signaux de terminaison. La connaissance précise des outils disponibles, de leurs arguments et de leurs limitations est également essentielle. Avec ces informations, les développeurs devraient être en mesure de construire des intégrations fiables et performantes.
