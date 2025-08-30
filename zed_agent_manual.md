# Manuel Définitif : Construire un Agent IA pour Zed avec ACP

Ce document est le guide complet et faisant autorité pour construire un agent CLI (Command-Line Interface) de qualité production qui s'intègre avec l'éditeur Zed en utilisant le **Protocole ACP (Agent Client Protocol)**. Il est centré autour d'un exemple de code fonctionnel et robuste fourni par la communauté.

## 📝 Table des Matières

1.  **Architecture et Concepts Clés**
2.  **Configuration de l'Agent dans Zed**
3.  **L'Exemple de Code de Référence (Node.js)**
    -   Le Code Complet
    -   Analyse du Code : Démarrage et Logging
    -   Analyse du Code : Communication avec Zed (stdin/stdout)
    -   Analyse du Code : Appel à un Service LLM Externe
    -   Analyse du Code : Gestion du Cycle de Vie des Requêtes
4.  **Référence Complète des Outils de l'Agent (Basée sur le Schéma Officiel)**
5.  **Guide de Débogage et de Production**

---

## 1. Architecture et Concepts Clés
- **Agent CLI :** Votre agent est un programme qui s'exécute en ligne de commande.
- **`stdin`/`stdout` :** Zed communique avec votre agent en écrivant des messages sur son `stdin` et en lisant ses réponses sur son `stdout`.
- **JSON-RPC 2.0 :** C'est le format des messages échangés.
- **Agent "Stateless" :** L'agent lui-même peut être simple. Il reçoit une requête, la transmet à un "cerveau" (le service LLM), et relaie la réponse.

---

## 2. Configuration de l'Agent dans Zed
Modifiez votre `settings.json` pour que Zed puisse lancer votre agent. Le chemin vers le script doit être **absolu**.
```json
{
  "agent_servers": {
    "Mon Agent Final": {
      "command": "node",
      "args": ["/path/to/your/working_agent_example.js"],
      "env": {
        "LOG_FILE": "/tmp/zed_agent.log"
      }
    }
  }
}
```
- Après avoir sauvegardé, ouvrez le panneau de l'agent (`Cmd-Shift-Space`), cliquez sur le `+` et sélectionnez "Mon Agent Final".

---

## 3. L'Exemple de Code de Référence (Node.js)
Le code suivant, fourni par la communauté, est un exemple complet et fonctionnel. Il sert de base à toutes les explications de ce guide.

### Le Code Complet
*(Le contenu de `working_agent_example.js` est présenté ici. Pour la concision, il n'est pas dupliqué, mais ce manuel suppose que vous l'avez à disposition.)*

### Analyse du Code : Démarrage et Logging
- **`#!/usr/bin/env node`**:  Indique que le script doit être exécuté avec Node.js.
- **Flags ACP**: Le script vérifie la présence de `--acp` ou `--experimental-acp` au démarrage, une bonne pratique pour s'assurer qu'il est lancé par Zed.
- **Logging**: La fonction `log` écrit dans un fichier (`zed_debug.log` par défaut). C'est crucial car `console.log` écrirait sur `stdout` et corromprait le flux JSON-RPC.

### Analyse du Code : Communication avec Zed (stdin/stdout)
- **`readline`**: Le module `readline` de Node.js est utilisé pour lire `process.stdin` ligne par ligne. C'est la méthode standard pour traiter les messages JSON-RPC entrants.
- **`sendSafe`**: Cette fonction encapsule `process.stdout.write`. Elle prend un objet JavaScript, le convertit en chaîne JSON, ajoute un saut de ligne (`\n`), et l'envoie à Zed.

### Analyse du Code : Appel à un Service LLM Externe
- **`callLLM`**: Cette fonction `async` montre comment l'agent peut agir comme un client HTTP.
  - Elle utilise `fetch` pour envoyer une requête `POST` à un service externe (par défaut `http://localhost:9000/chat`).
  - Elle envoie le prompt de l'utilisateur dans le corps de la requête.
  - Elle gère les erreurs réseau et les réponses non-200.

### Analyse du Code : Gestion du Cycle de Vie des Requêtes
- **`rl.on("line", ...)`**: C'est le cœur de l'agent. Chaque ligne de Zed est un message JSON-RPC.
- **Requêtes vs Notifications**: Le code vérifie la présence d'un `id` pour distinguer les requêtes (qui nécessitent une réponse) des notifications.
- **`initialize` et `session/new`**: Le code gère correctement le handshake initial en répondant aux requêtes de Zed.
- **`session/prompt`**: C'est ici que la magie opère. Quand un prompt arrive :
    1.  L'agent envoie une notification `session/update` à Zed pour dire "Je réfléchis...".
    2.  Il appelle le service LLM externe avec `callLLM`.
    3.  Il envoie la réponse du LLM à Zed dans une autre notification `session/update`.
    4.  Enfin, il envoie la réponse à la requête `session/prompt` originale pour signaler que le traitement est terminé.

---

## 4. Référence Complète des Outils de l'Agent
*(Cette section contiendrait la référence complète des 14+ outils, basée sur le schéma JSON fourni par l'utilisateur. Chaque outil aurait sa description, un tableau d'arguments, et un exemple JSON complet.)*

**Exemple pour `edit_file` :**
- **Description:** Crée ou modifie un fichier.
- **Arguments:**
  | Champ | Type | Requis? |
  |:---|:---|:---|
  | `display_description` | `string` | Oui |
  | `path` | `string` | Oui |
  | `mode` | `string` | Oui |
- **`toolInput` Exemple:** `{ "display_description": "Add new function", "path": "src/app.js", "mode": "create", "content": "function hello() {}" }`

---

## 5. Guide de Débogage et de Production
- **Débogage :**
  1.  **Vérifiez votre log (`zed_debug.log`) :** C'est l'étape la plus importante.
  2.  **Utilisez `dev: open acp logs` dans Zed :** Pour inspecter la communication brute.
  3.  **Testez en isolation :** `echo '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | node working_agent_example.js`
- **Production :**
  - Utilisez des variables d'environnement pour la configuration.
  - Implémentez une gestion d'erreurs plus fine.
  - Ajoutez un "health check" à votre service LLM.
