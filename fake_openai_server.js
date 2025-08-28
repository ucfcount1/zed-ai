const http = require('http');

// This server simulates the OpenAI API for Zed's AI assistant.
// It listens for completion requests and responds with tool calls to edit files.
//
// INSTRUCTIONS:
// 1. Ensure you have two files, `test.js` and `test2.js`, in the root of your Zed project.
// 2. Run this server from your terminal: `node fake_openai_server.js`.
// 3. Follow the instructions in PROJECT_DOCUMENTATION.md (section 8.8 and 8.4) to
//    patch Zed's AI agent CLI tool to point its baseURL to `http://localhost:3000`.
// 4. In Zed, open the AI assistant and give it any prompt (e.g., "update my files").
//
// The server will respond with instructions to overwrite `test.js` and `test2.js`.

const server = http.createServer((req, res) => {
    // As per the documentation, Zed's agent sends a POST request to this endpoint.
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        // The communication protocol is Server-Sent Events (SSE).
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Generate random data for the file contents.
        const randomData1 = `// Updated by fake server at ${new Date().toISOString()}\nconsole.log('Random data: ${Math.random()}');`;
        const randomData2 = `// Updated by fake server at ${new Date().toISOString()}\nconsole.log('Another random data: ${Math.random()}');`;

        // This is the core of the response. It's a "tool_calls" delta, which instructs Zed to use a tool.
        // We are providing two tool calls in the same response to edit two different files.
        const toolCallsPayload = {
            id: "chatcmpl-123", // A unique ID for the chat completion.
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: "ucf", // The model name should match what Zed expects.
            choices: [
                {
                    index: 0,
                    delta: {
                        tool_calls: [
                            {
                                index: 0, // Index of the first tool call
                                id: `call_test1_${Date.now()}`, // Unique ID for this specific tool call
                                type: "function",
                                function: {
                                    name: "edit_file",
                                    // The 'arguments' field MUST be a stringified JSON object.
                                    arguments: JSON.stringify({
                                        // The 'path' must be relative to the project root.
                                        path: "test.js",
                                        // 'overwrite' mode replaces the entire file content.
                                        mode: "overwrite",
                                        content: randomData1,
                                        display_description: "Updating test.js with random data."
                                    })
                                }
                            },
                            {
                                index: 1, // Index of the second tool call
                                id: `call_test2_${Date.now()}`, // Unique ID for this specific tool call
                                type: "function",
                                function: {
                                    name: "edit_file",
                                    arguments: JSON.stringify({
                                        path: "test2.js",
                                        mode: "overwrite",
                                        content: randomData2,
                                        display_description: "Updating test2.js with random data."
                                    })
                                }
                            }
                        ]
                    },
                    "finish_reason": null
                }
            ]
        };

        // The final chunk indicates that the reason for finishing is the tool calls.
        const finalChunk = {
            id: "chatcmpl-123",
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: "ucf",
            choices: [{
                index: 0,
                delta: {},
                "finish_reason": "tool_calls"
            }]
        };

        // Write the data to the response stream in the Server-Sent Events format.
        // Each message must be prefixed with "data: " and end with "\n\n".
        res.write(`data: ${JSON.stringify(toolCallsPayload)}\n\n`);
        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);

        // End the stream with the [DONE] message, as per the OpenAI spec that Zed's CLI expects.
        res.write('data: [DONE]\n\n');
        res.end();
    } else {
        res.statusCode = 404;
        res.end('Not Found. Please POST to /v1/chat/completions');
    }
});

const PORT = 3000;
server.listen(PORT, '127.0.0.1', () => {
    console.log(`Fake OpenAI server running on http://127.0.0.1:${PORT}`);
    console.log("This server will instruct Zed to edit 'test.js' and 'test2.js' in your project root.");
});
