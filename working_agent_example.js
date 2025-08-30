#!/usr/bin/env node

const readline = require("readline");
const fs = require("fs");

// Vérifier les flags ACP
const hasACPFlag =
  process.argv.includes("--acp") || process.argv.includes("--experimental-acp");
if (!hasACPFlag) {
  console.error("Agent must be launched with --acp or --experimental-acp flag");
  process.exit(1);
}

// Configuration du logging
const logFilePath = "zed_debug.log";
const log = (msg) => {
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFilePath, `[${timestamp}] ${msg}\n`);
  } catch (e) {
    // Ignore logging errors
  }
};

// Fonction pour envoyer des messages JSON-RPC à Zed
const sendSafe = (obj) => {
  try {
    const json = JSON.stringify(obj);
    console.log(json);
    log(`SENT TO ZED: ${json}`);
  } catch (e) {
    log(`SEND ERROR: ${e.message}`);
  }
};

// Fonction pour appeler le serveur LLM local
const callLLM = async (text) => {
  try {
    log(`Calling LLM with text: "${text}"`);

    const response = await fetch("http://localhost:9000/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const llmData = await response.json();
    log(`LLM Response: ${JSON.stringify(llmData)}`);

    // Extraire le contenu de la réponse
    let content = llmData.content || llmData.message || "Pas de réponse du LLM";

    // Nettoyer le contenu (supprimer caractères de contrôle)
    content = content.replace(/[\x00-\x1F\x7F]/g, "").trim();

    log(`Extracted content: "${content}"`);
    return content;
  } catch (error) {
    log(`LLM Error: ${error.message}`);
    return `Erreur lors de l'appel au LLM: ${error.message}`;
  }
};

// === DÉMARRAGE DE L'AGENT ACP ===
log("=========================================");
log("ACP Agent Started - Full Version");
log("=========================================");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

let currentSessionId = null;

rl.on("line", async (line) => {
  if (!line.trim()) return;

  log(`RECEIVED FROM ZED: ${line}`);

  try {
    const msg = JSON.parse(line);

    // === GESTION DES REQUÊTES JSON-RPC ===

    // 1. Initialize request
    if (msg.method === "initialize" && msg.id !== undefined) {
      log("Handling initialize request");
      sendSafe({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: 1,
          capabilities: {
            sampling: {},
            tools: {},
          },
          serverInfo: {
            name: "local-llm-agent",
            version: "1.0.0",
          },
        },
      });
      return;
    }

    // 2. Session/new request
    if (msg.method === "session/new" && msg.id !== undefined) {
      currentSessionId = `session_${Date.now()}`;
      log(`Creating new session: ${currentSessionId}`);
      sendSafe({
        jsonrpc: "2.0",
        id: msg.id,
        result: { sessionId: currentSessionId },
      });
      return;
    }

    // 3. Session/close request
    if (msg.method === "session/close" && msg.id !== undefined) {
      log(`Closing session: ${currentSessionId}`);
      currentSessionId = null;
      sendSafe({
        jsonrpc: "2.0",
        id: msg.id,
        result: {},
      });
      return;
    }

    // 4. Session/prompt request (LE CAS PRINCIPAL)
    if (msg.method === "session/prompt" && msg.id !== undefined) {
      log("Processing session/prompt request...");

      // Extraire le texte du prompt
      let userText = "";
      if (msg.params?.prompt && Array.isArray(msg.params.prompt)) {
        userText = msg.params.prompt
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join(" ");
      }

      const sessionId = msg.params.sessionId;
      log(`Session: ${sessionId}, User text: "${userText}"`);

      // 4a. Envoyer notification "thinking"
      sendSafe({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: sessionId,
          update: {
            sessionUpdate: "text",
            content: "🤖 Traitement de votre message avec mon LLM local...",
          },
        },
      });

      // 4b. Appeler le LLM
      const llmResponse = await callLLM(userText);

      // 4c. Envoyer la réponse du LLM
      sendSafe({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: sessionId,
          update: {
            sessionUpdate: "text",
            content: llmResponse,
          },
        },
      });

      // 4d. Répondre à la requête JSON-RPC
      sendSafe({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          success: true,
          processed: true,
        },
      });

      return;
    }

    // === GESTION DES NOTIFICATIONS ===

    // Session/cancel notification
    if (msg.method === "session/cancel") {
      log(`Session cancel notification for: ${msg.params?.sessionId}`);
      // Pas de réponse pour les notifications
      return;
    }

    // Autres notifications
    if (msg.method && msg.id === undefined) {
      log(`Other notification: ${msg.method}`);
      return;
    }

    // === AUTRES REQUÊTES ===
    if (msg.id !== undefined) {
      log(`Unknown request method: ${msg.method}`);
      sendSafe({
        jsonrpc: "2.0",
        id: msg.id,
        result: {},
      });
    }
  } catch (error) {
    log(`ERROR parsing message: ${error.message}`);
    log(`Raw message was: ${line}`);
  }
});

// Gestion de l'arrêt propre
process.on("exit", (code) => {
  log(`ACP Agent exited with code: ${code}`);
});

process.on("SIGINT", () => {
  log("ACP Agent interrupted by SIGINT");
  process.exit(0);
});

process.on("SIGTERM", () => {
  log("ACP Agent terminated by SIGTERM");
  process.exit(0);
});

// Garder le processus actif
process.stdin.resume();
log("ACP Agent ready and waiting for Zed messages...");
