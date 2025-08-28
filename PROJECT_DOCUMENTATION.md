# 📖 Guide d'Implémentation d'Agent IA pour Zed

Ce document fournit une spécification technique détaillée et un guide pratique pour construire un serveur LLM externe capable de s'intégrer avec les fonctionnalités d'agent de Zed, notamment pour l'édition de fichiers. Il est le résultat d'une analyse approfondie du code source de Zed et vise à fournir une solution "infaillible" pour les développeurs.

## 📝 Table des Matières

- [1. L'Architecture Réelle : Agent Rust Intégré](#1-larchitecture-réelle--agent-rust-intégré)
- [2. Spécification de l'API du Serveur Externe](#2-spécification-de-lapi-du-serveur-externe)
  - [2.1. Endpoint et Méthode](#21-endpoint-et-méthode)
  - [2.2. Format de la Réponse : Server-Sent Events (SSE)](#22-format-de-la-réponse--server-sent-events-sse)
  - [2.3. Structure des Données SSE](#23-structure-des-données-sse)
- [3. La Solution au "Problème de la Boucle" : Terminaison du Stream](#3-la-solution-au-problème-de-la-boucle--terminaison-du-stream)
- [4. Exemple Pratique : Serveur Node.js Fonctionnel](#4-exemple-pratique--serveur-nodejs-fonctionnel)
- [5. Configuration et Débogage](#5-configuration-et-débogage)
  - [5.1. Configurer Zed](#51-configurer-zed)
  - [5.2. Stratégie de Débogage](#52-stratégie-de-débogage)

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

**Exemple de chunk de données pour un `tool_call` :**
```json
{
  "id": "chatcmpl-unique-id",
  "object": "chat.completion.chunk",
  "created": 1694268190,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "delta": {
        "tool_calls": [
          {
            "index": 0,
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "edit_file",
              "arguments": "{\\"path\\":\\"file.txt\\",\\"mode\\":\\"overwrite\\",\\"content\\":\\"Nouveau contenu\\"}"
            }
          }
        ]
      },
      "finish_reason": null
    }
  ]
}
```
- **Important :** Les arguments de la fonction (`arguments`) doivent être une chaîne de caractères JSON échappée.

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

**Workflow complet du stream :**
1.  Envoyer un ou plusieurs chunks `data:` contenant les `tool_calls`.
2.  Envoyer un chunk `data:` avec `finish_reason: "tool_calls"`.
3.  Envoyer `data: [DONE]\n\n`.
4.  Clore la connexion.

Le respect de cette séquence est **la clé absolue** pour que l'intégration fonctionne.

## 4. Exemple Pratique : Serveur Node.js Fonctionnel

Voici un code de serveur Node.js complet et fonctionnel qui implémente la spécification ci-dessus, y compris la gestion correcte de la fin de stream.

```javascript
// fixed_fake_openai_server.js
const http = require('http');

const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url.endsWith('/v1/chat/completions')) {
        console.log("Received request from Zed.");

        // 1. Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // 2. Define the tool call payload
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
                                content: `console.log("Hello from the reverse-engineered server at ${new Date().toLocaleTimeString()}");`
                            })
                        }
                    }]
                },
                finish_reason: null
            }]
        };

        // 3. Define the final chunk with the critical `finish_reason`
        const finalChunkPayload = {
            id: toolCallPayload.id,
            object: "chat.completion.chunk",
            created: toolCallPayload.created,
            model: toolCallPayload.model,
            choices: [{
                index: 0,
                delta: {},
                finish_reason: "tool_calls" // <-- The key to prevent loops!
            }]
        };

        // 4. Write the chunks to the response stream
        console.log("Sending tool_calls chunk...");
        res.write(`data: ${JSON.stringify(toolCallPayload)}\n\n`);

        console.log("Sending finish_reason chunk...");
        res.write(`data: ${JSON.stringify(finalChunkPayload)}\n\n`);

        console.log("Sending [DONE] message...");
        res.write('data: [DONE]\n\n');

        // 5. End the response
        res.end();
        console.log("Stream ended.");

    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

server.listen(3000, () => {
    console.log('Bulletproof Fake OpenAI server for Zed running on http://localhost:3000');
});
```

## 5. Configuration et Débogage

### 5.1. Configurer Zed
1.  Ouvrez vos paramètres Zed (`settings.json`).
2.  Ajoutez ou modifiez la section `openai` pour pointer vers votre serveur local.

```json
{
  // ... autres paramètres
  "assistant": {
    "version": "1",
    "enabled": true,
    "default_model": {
      "provider": "openai",
      "model": "gpt-4-bulletproof"
    }
  },
  "openai": {
    "api_url": "http://localhost:3000/v1"
  }
}
```
3. **Redémarrez Zed** pour vous assurer que les nouveaux paramètres sont pris en compte.

### 5.2. Stratégie de Débogage
Le débogage se fait principalement du côté de votre serveur.

1.  **Logs du Serveur :** Lancez votre serveur Node.js dans un terminal. Ajoutez des `console.log` pour voir quand les requêtes arrivent et ce que votre serveur envoie. L'exemple ci-dessus inclut de tels logs.
2.  **`curl` pour Tester :** Testez votre serveur indépendamment de Zed en utilisant `curl`.
    ```sh
    curl -N -X POST http://localhost:3000/v1/chat/completions
    ```
    - L'option `-N` (no-buffering) est importante pour voir les chunks SSE arriver en temps réel.
    - Vérifiez que la sortie est exactement conforme à la spécification (les `data:`, les `\n\n`, et les deux derniers messages de fin).
3.  **Logs de Zed :** Si votre serveur semble correct mais que rien ne se passe, consultez les logs de Zed (`Help > Show Logs`). Cherchez des erreurs de connexion réseau ou des erreurs de parsing JSON si votre serveur envoie un format inattendu.

### 5.3. Analyse des Logs de Zed (Exemples Réels)

Lorsque le débogage côté serveur ne suffit pas, les logs de Zed peuvent révéler comment le client interne interprète (ou échoue à interpréter) la réponse de votre serveur.

**Rappel :** Ouvrez les logs via `Help > Show Logs`.

#### Scénario 1 : Succès

Quand tout fonctionne, vous ne verrez probablement **pas d'erreur évidente**. Vous verrez plutôt des messages de routine indiquant le traitement des événements. Chercher le nom de votre outil (`edit_file`) peut être utile. Un log de succès est souvent silencieux.

#### Scénario 2 : Échec - JSON Malformé

Supposons que votre serveur envoie un JSON invalide dans le flux SSE (par exemple, avec une virgule en trop). Zed ne pourra pas le parser.

**Ce que vous verrez dans `zed.log` :**
Vous verrez une erreur provenant du `language_models` crate, probablement de `open_ai.rs` ou `serde_json`. Cherchez des mots-clés comme `ERROR`, `language_model`, `stream`, `deserialize`.

**Exemple de log d'erreur (simulé mais représentatif) :**
```log
[2023-10-27T10:30:05Z ERROR language_models::provider::open_ai] stream error: error deserializing response: Error("invalid type: map, expected a string", line: 1, column: 88)
```
ou
```log
[2023-10-27T10:32:15Z ERROR gpui::platform::mac] unhandled error on window thread: error calling update: error calling update: stream error: error deserializing response: Error("unexpected end of input", line: 1, column: 150)
```
- **Action :** Cette erreur indique que le JSON que votre serveur a envoyé n'est pas valide. Copiez le JSON de votre serveur et collez-le dans un validateur JSON en ligne pour trouver l'erreur de syntaxe.

#### Scénario 3 : Échec - `finish_reason` Manquant

C'est le "problème de la boucle". Si vous oubliez d'envoyer le chunk final avec `finish_reason: "tool_calls"`, il n'y aura **pas d'erreur explicite** dans les logs.

**Ce que vous observerez :**
- Zed restera en état de "génération" indéfiniment.
- Les logs de Zed ne montreront aucune nouvelle activité après le dernier chunk de données reçu. Il n'y aura pas de message "stream completed" ou "stopped".
- Votre serveur, lui, aura terminé d'envoyer les données et clos la connexion.

- **Action :** Si Zed semble bloqué, la cause la plus probable est un flux SSE mal terminé. Vérifiez que votre serveur envoie bien le chunk avec `finish_reason: "tool_calls"` **puis** le message `data: [DONE]\n\n` avant de clore la connexion.

---

## 6. Conclusion

Ce guide a démystifié l'intégration d'agents IA avec Zed. La clé du succès ne réside pas dans la modification d'un agent externe, mais dans la création d'un serveur backend qui respecte rigoureusement la spécification de l'API OpenAI, en particulier le protocole de streaming et ses signaux de terminaison. Avec ces informations, les développeurs devraient être en mesure de construire des intégrations fiables et performantes.
