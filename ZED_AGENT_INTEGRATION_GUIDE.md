# Guide Définitif pour l'Intégration d'Agents CLI avec Zed via ACP

Ce document fournit une spécification technique complète et un guide pratique pour construire un **agent CLI (Command-Line Interface)** qui communique avec l'éditeur Zed via le **Protocole ACP (Agent Client Protocol)**.

## 1. Architecture et Configuration

L'intégration se fait en déclarant un agent externe dans votre `settings.json`. Zed exécutera votre programme en tant que sous-processus et communiquera avec lui via `stdin` et `stdout`.

### 1.1. Configuration de `settings.json`
Pour que Zed utilise votre agent, ajoutez la configuration suivante :

```json
{
  "agent_servers": {
    "Mon Agent ACP": {
      "command": "node",
      "args": ["/chemin/absolu/vers/votre/agent.js"],
      "env": {}
    }
  }
}
```
- **Important :** Remplacez `/chemin/absolu/vers/votre/agent.js` par le chemin correct vers votre script.
- Après avoir sauvegardé, ouvrez le panneau de l'agent (`Cmd-Shift-Space`), cliquez sur le `+` et sélectionnez "Mon Agent ACP".

## 2. Spécification du Protocole ACP

La communication est basée sur **JSON-RPC 2.0** sur `stdin`/`stdout`. Chaque message JSON doit être sur une seule ligne, terminé par `\n`.

### 2.1. Le Handshake Initial
1.  **Zed -> Agent :** Requête `initialize`. L'agent doit répondre avec ses capacités.
2.  **Zed -> Agent :** Requête `session/new`. L'agent doit répondre avec un `sessionId` unique.

### 2.2. Recevoir le Prompt Utilisateur
- **Zed -> Agent :** Notification `session/update`. Lorsque l'utilisateur envoie un message, Zed envoie une notification avec un `update` de type `prompt` contenant le message.

### 2.3. Envoyer des Actions à Zed
- **Agent -> Zed :** Notification `tool/call`. Pour demander à Zed d'exécuter une action, comme modifier un fichier, l'agent envoie une notification `tool/call`.

## 3. Exemple Complet et Fonctionnel : Agent Node.js

Voici un script Node.js complet qui gère le handshake, reçoit un prompt, et demande à Zed de modifier un fichier en utilisant l'outil `edit_file`.

**Créez ce fichier (par ex: `my_zed_agent.js`) et mettez à jour votre `settings.json` pour pointer vers lui.**

```javascript
// my_zed_agent.js
const readline = require('readline');
const fs = require('fs');

// Le débogage via stdout est impossible, utilisez un fichier de log.
const logFilePath = '/tmp/zed_agent.log';
const log = (message) => {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFilePath, `[${timestamp}] ${String(message)}\n`);
};

// --- Fonctions de communication ---
const sendMessage = (message) => {
  const messageString = JSON.stringify(message);
  process.stdout.write(messageString + '\n');
  log(`Sent to Zed: ${messageString}`);
};

const sendResponse = (id, result) => {
  sendMessage({ jsonrpc: '2.0', id, result });
};

const sendNotification = (method, params) => {
  sendMessage({ jsonrpc: '2.0', method, params });
};


// --- Logique de l'Agent ---
log('--- Agent Started ---');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

let activeSessionId = null;

rl.on('line', (line) => {
  log(`Received from Zed: ${line}`);
  try {
    const request = JSON.parse(line);

    if (request.id) {
      // C'est une Requête, on doit y répondre
      switch (request.method) {
        case 'initialize':
          sendResponse(request.id, { capabilities: {} });
          break;
        case 'session/new':
          activeSessionId = `session_${Date.now()}`;
          sendResponse(request.id, { sessionId: activeSessionId });
          break;
        default:
          // Méthode non gérée, mais on doit répondre
          sendResponse(request.id, null);
      }
    } else {
      // C'est une Notification, on y réagit
      if (request.method === 'session/update' && request.params.update.sessionUpdate === 'prompt') {
        // L'utilisateur a envoyé un message.
        // En réponse, demandons à Zed d'éditer un fichier.

        // 1. Envoyer un message de "réflexion" à l'UI de Zed
        sendNotification('session/update', {
          sessionId: activeSessionId,
          update: {
            sessionUpdate: 'text',
            content: "Bien sûr, je vais modifier le fichier `response.log` pour vous."
          }
        });

        // 2. Envoyer la demande d'appel d'outil
        sendNotification('tool/call', {
          sessionId: activeSessionId,
          toolName: 'edit_file',
          toolInput: {
            display_description: "Write a response to the user prompt",
            path: "response.log",
            mode: "overwrite",
            content: `User prompt received at ${new Date().toLocaleTimeString()}.\n\nPrompt content:\n${request.params.update.prompt}`
          }
        });
      }
    }
  } catch (error) {
    log(`ERROR: ${error.message}\n${error.stack}`);
  }
});

process.on('exit', (code) => {
  log(`--- Agent Exited with code ${code} ---`);
});
```

## 4. Débogage de votre Agent
1.  **Vérifiez le fichier de log :** Toutes les interactions et erreurs sont écrites dans `/tmp/zed_agent.log`. C'est votre source de vérité.
2.  **Utilisez la Palette de Commandes de Zed :** La commande `dev: open acp logs` ouvre une vue qui montre tous les messages JSON-RPC bruts échangés entre Zed et votre agent. C'est extrêmement utile pour voir si vos messages sont correctement formatés.
3.  **Vérifiez le chemin dans `settings.json` :** Une erreur courante est un chemin incorrect vers votre script d'agent. Assurez-vous qu'il est absolu et correct.
