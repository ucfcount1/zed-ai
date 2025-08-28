// production_ready_server.js
// A more robust, "production-ready" fake OpenAI server for Zed.

const http = require('http');
const { URL } = require('url');

// --- Configuration ---
// Use environment variables for configuration with sensible defaults.
const PORT = process.env.PORT || 3000;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// --- Logger ---
// A simple logger to show timestamps and log levels.
const log = (level, message, ...args) => {
    if (['info', 'warn', 'error'].includes(level) && LOG_LEVEL === 'info') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${level.toUpperCase()}]`, message, ...args);
    }
};

// --- SSE Handler ---
// Handles the Server-Sent Events logic for a given request and response.
function handleSseRequest(req, res) {
    log('info', 'Handling SSE request for /v1/chat/completions');

    // In a real application, you would parse the request body here.
    // const chunks = [];
    // req.on('data', chunk => chunks.push(chunk));
    // req.on('end', () => {
    //   const requestBody = JSON.parse(Buffer.concat(chunks).toString());
    //   // Here you would add input validation on the requestBody.
    //   // For example, using a library like Zod or Joi.
    // });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Optional: A heartbeat to keep the connection alive on some networks.
    // const heartbeat = setInterval(() => {
    //     res.write(': heartbeat\n\n');
    // }, 15000);
    // req.on('close', () => clearInterval(heartbeat));

    const toolCallPayload = {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "gpt-4-production",
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
                            display_description: "Run production-ready server test",
                            path: "test.log",
                            mode: "overwrite",
                            content: `Test from production-ready server successful at ${new Date().toISOString()}.`
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
    log('info', 'Sent tool_calls chunk.');

    res.write(`data: ${JSON.stringify(finalChunkPayload)}\n\n`);
    log('info', 'Sent finish_reason chunk.');

    res.write('data: [DONE]\n\n');
    log('info', 'Sent [DONE] message.');

    res.end();
    log('info', 'SSE stream ended.');
}

// --- Main Server Logic ---
const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const { method, pathname } = req;

    try {
        log('info', `Received request: ${method} ${pathname}`);

        // --- Router ---
        if (method === 'GET' && pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
        } else if (method === 'GET' && pathname === '/v1/models') {
            // A real server would provide a list of available models.
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                object: "list",
                data: [{ id: "gpt-4-production", object: "model", owned_by: "user" }]
            }));
        } else if (method === 'POST' && pathname === '/v1/chat/completions') {
            handleSseRequest(req, res);
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Not Found' } }));
        }

    } catch (error) {
        log('error', 'An unexpected error occurred:', error);
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify({ error: { message: 'Internal Server Error' } }));
    }
});

// --- Server Start ---
server.listen(PORT, () => {
    log('info', `Production-ready Fake OpenAI server running on http://localhost:${PORT}`);
});

server.on('error', (error) => {
    log('error', 'Server failed to start:', error);
});
