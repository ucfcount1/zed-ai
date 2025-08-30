# Manuel Technique Définitif : Intégration d'Agents CLI avec Zed via ACP

Ce document est le guide complet et faisant autorité pour construire un agent CLI (Command-Line Interface) de qualité production qui s'intègre avec l'éditeur Zed en utilisant le **Protocole ACP (Agent Client Protocol)**. Il est basé sur l'analyse du code source de Zed et sur le schéma de communication réel utilisé par l'éditeur.

## 📝 Table des Matières

1.  **Architecture Fondamentale : Agent CLI sur `stdin/stdout`**
2.  **Configuration de l'Agent dans Zed**
3.  **Le "System Prompt" : Les Règles du Jeu**
4.  **Spécification du Protocole ACP (JSON-RPC)**
    - Le Handshake : `initialize` et `session/new`
    - Communication : `session/update`
    - Le Cycle de Vie des Outils : `tool/call` et `tool/result`
    - Fin de Session : `session/close`
5.  **Référence Complète des Outils de l'Agent**
    - `copy_path`, `create_directory`, `delete_path`, `diagnostics`, `edit_file`, `fetch`, `find_path`, `grep`, `list_directory`, `move_path`, `now`, `read_file`, `terminal`, `thinking`
6.  **Exemple de Code Complet : Agent de Bout en Bout**
7.  **Guide de Débogage et de Production**
    - Checklist de Validation
    - Erreurs Communes et Solutions
    - Bonnes Pratiques pour la Production

---

## 1. Architecture Fondamentale : Agent CLI sur `stdin/stdout`

L'intégration d'un agent personnalisé se fait en déclarant un programme externe dans votre `settings.json`. Zed exécute ce programme en tant que **sous-processus** et communique avec lui exclusivement via les flux **`stdin`** (Zed -> Agent) et **`stdout`** (Agent -> Zed). Il n'y a pas de serveur HTTP impliqué dans ce mode de communication.

---

## 2. Configuration de l'Agent dans Zed

Modifiez votre `settings.json` pour déclarer votre agent :
```json
{
  "agent_servers": {
    "Mon Agent Complet": {
      "command": "node",
      "args": ["/chemin/absolu/vers/votre/agent.js"],
      "env": {
        "LOG_FILE": "/tmp/zed_agent.log"
      }
    }
  }
}
```
- **Important :** Le chemin vers votre script (`args`) doit être absolu.
- Après avoir sauvegardé, ouvrez le panneau de l'agent (`Cmd-Shift-Space`), cliquez sur le `+` et sélectionnez "Mon Agent Complet".

---

## 3. Le "System Prompt" : Les Règles du Jeu

Zed envoie un premier message système (`role: "system"`) qui contient des instructions strictes pour le LLM. Votre agent doit être conçu en gardant ces règles à l'esprit.
- **Formatage :** Les réponses doivent être en Markdown. Les blocs de code doivent **obligatoirement** suivre le format ` ```path/to/file#L1-10 `. Tout autre format (ex: ` ```javascript `) est invalide.
- **Utilisation des Outils :** L'agent ne doit utiliser que les outils fournis dans la requête, respecter leur schéma JSON, et ne pas deviner les chemins de fichiers.
- **Comportement :** L'agent doit être conversationnel, professionnel, et ne jamais inventer d'informations.

---

## 4. Spécification du Protocole ACP (JSON-RPC)

La communication est en **JSON-RPC 2.0** sur `stdin`/`stdout`. Chaque message est un objet JSON sur une seule ligne, terminé par `\n`.

- **`initialize` (Zed -> Agent) :** Requête initiale. L'agent doit répondre avec ses capacités.
- **`session/new` (Zed -> Agent) :** Demande de création de session. L'agent doit répondre avec un `sessionId` unique.
- **`session/update` (Zed -> Agent ou Agent -> Zed) :** Notification pour échanger des informations (prompts, réponses textuelles, etc.).
- **`tool/call` (Agent -> Zed) :** Notification envoyée par l'agent pour demander à Zed d'exécuter un outil.
- **`tool/result` (Zed -> Agent) :** Notification envoyée par Zed pour donner le résultat d'un `tool/call`.
- **`session/close` (Zed -> Agent) :** Requête pour terminer la session.

---

## 5. Référence Complète des Outils de l'Agent

Voici la liste exhaustive des outils, générée à partir du schéma officiel de Zed.

*(Note : Pour la lisibilité, seuls quelques exemples sont détaillés ici, mais un agent réel doit pouvoir gérer tous les outils listés dans le `system_prompt`.)*

#### `edit_file`
- **Description:** Crée, modifie ou écrase un fichier.
- **Arguments:**
  | Champ | Type | Requis? |
  | :--- | :--- | :--- |
  | `display_description` | `string` | Oui |
  | `path` | `string` | Oui |
  | `mode` | `string` | Oui |
  | `content` / `old_text` / `new_text` | `string` | Dépends du `mode` |
- **Exemple JSON (`toolInput`):**
  ```json
  { "display_description": "Add a new function", "path": "src/utils.js", "mode": "create", "content": "function newUtil() { return true; }" }
  ```

#### `read_file`
- **Description:** Lit le contenu d'un fichier.
- **Arguments:**
  | Champ | Type | Requis? |
  | :--- | :--- | :--- |
  | `path` | `string` | Oui |
  | `start_line` | `integer`| Non |
  | `end_line` | `integer`| Non |
- **Exemple JSON (`toolInput`):**
  ```json
  { "path": "README.md" }
  ```

#### `terminal`
- **Description:** Exécute une commande shell.
- **Arguments:**
  | Champ | Type | Requis? |
  | :--- | :--- | :--- |
  | `command` | `string` | Oui |
  | `cd` | `string` | Oui |
- **Exemple JSON (`toolInput`):**
  ```json
  { "command": "npm install express", "cd": "backend" }
  ```

#### Liste des autres outils :
`copy_path`, `create_directory`, `delete_path`, `diagnostics`, `fetch`, `find_path`, `grep`, `list_directory`, `move_path`, `now`, `thinking`.

---

## 6. Exemple de Code Complet : Agent de Bout en Bout

Ce script Node.js est un agent complet et fonctionnel. Il ne contient **pas** de serveur HTTP, il est destiné à être exécuté directement par Zed.

```javascript
// zed_acp_agent.js
const readline = require('readline');
const fs = require('fs');

// --- Configuration ---
const LOG_FILE = process.env.LOG_FILE || '/tmp/zed_agent.log';

// --- Logger ---
const log = (message, data) => {
  const timestamp = new Date().toISOString();
  let logMessage = `[${timestamp}] ${message}\n`;
  if (data) {
    logMessage = `[${timestamp}] ${message} ${JSON.stringify(data, null, 2)}\n`;
  }
  fs.appendFileSync(LOG_FILE, logMessage);
};

// --- Communication avec Zed ---
const sendMessage = (message) => {
  const messageString = JSON.stringify(message);
  process.stdout.write(messageString + '\n');
  log('Sent to Zed:', message);
};

const sendResponse = (id, result) => sendMessage({ jsonrpc: '2.0', id, result });
const sendNotification = (method, params) => sendMessage({ jsonrpc: '2.0', method, params });

// --- Logique Principale de l'Agent ---
let activeSessionId = null;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  try {
    const request = JSON.parse(line);
    log('Received from Zed:', request);

    if (request.id) { // C'est une Requête
      handleRequest(request);
    } else { // C'est une Notification
      handleNotification(request);
    }
  } catch (error) {
    log(`FATAL ERROR parsing line: ${line}`, error);
  }
});

function handleRequest(request) {
  let result = null;
  switch (request.method) {
    case 'initialize':
      result = { capabilities: {} };
      break;
    case 'session/new':
      activeSessionId = `session_${Date.now()}`;
      result = { sessionId: activeSessionId };
      break;
    case 'session/close':
      activeSessionId = null;
      result = {};
      break;
  }
  sendResponse(request.id, result);
}

function handleNotification(notification) {
  if (!activeSessionId || notification.params.sessionId !== activeSessionId) {
    return;
  }

  switch (notification.method) {
    case 'session/update':
      if (notification.params.update.sessionUpdate === 'prompt') {
        // L'utilisateur a envoyé un prompt. On simule une décision de LLM.
        // Dans un vrai agent, ici on appellerait un LLM externe.
        const mockLlmDecision = {
          toolName: 'edit_file',
          toolInput: {
            display_description: "Répondre au prompt de l'utilisateur",
            path: "agent_response.txt",
            mode: "create",
            content: `L'utilisateur a dit : '${notification.params.update.prompt}'`
          }
        };

        // On demande à Zed d'exécuter l'outil
        sendNotification('tool/call', {
          sessionId: activeSessionId,
          toolName: mockLlmDecision.toolName,
          toolInput: mockLlmDecision.toolInput
        });
      }
      break;
    case 'tool/result':
      // Zed nous informe du résultat de l'outil.
      // On peut maintenant envoyer un message de confirmation.
      sendNotification('session/update', {
        sessionId: activeSessionId,
        update: {
          sessionUpdate: 'text',
          content: `Action terminée ! Le résultat de l'outil '${notification.params.toolName}' a été traité.`
        }
      });
      break;
  }
}

log('--- Zed ACP Agent Initialized ---');
```

---

## 7. Guide de Débogage et de Production

- **Débogage :**
  1.  **Fichier de Log :** C'est votre outil le plus important. Vérifiez `/tmp/zed_agent.log`.
  2.  **`dev: open acp logs` :** Utilisez cette commande dans Zed pour voir la communication brute.
  3.  **Chemin Absolu :** Assurez-vous que le chemin vers votre agent dans `settings.json` est absolu.
- **Production :**
  - **Gestion d'Erreurs :** Entourez les opérations critiques (comme `JSON.parse`) de blocs `try...catch`.
  - **Variables d'Environnement :** Utilisez `process.env` pour toute configuration.
  - **Tests :** Créez un script de test qui envoie des messages JSON-RPC à votre agent sur `stdin` et vérifie les réponses sur `stdout`.

---

## 8. Conclusion

Ce guide a couvert en profondeur le processus de création d'un agent CLI pour Zed. En comprenant l'architecture ACP, le format JSON-RPC et le cycle de vie des outils, vous disposez maintenant de toutes les clés pour construire des intégrations puissantes et personnalisées.
