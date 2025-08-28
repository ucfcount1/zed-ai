// final_test_server.js
// This code is created based on the guide in PROJECT_DOCUMENTATION.md
const http = require('http');

const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url.endsWith('/v1/chat/completions')) {
        console.log("Received request from Zed.");

        // 1. Set SSE headers as specified in the documentation
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // 2. Define the tool call payload, as per the data structure section
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
                                display_description: "Execute test based on documentation",
                                path: "test.log",
                                mode: "overwrite",
                                content: `Test successful at ${new Date().toISOString()}. The documentation provided a clear and working example.`
                            })
                        }
                    }]
                },
                finish_reason: null
            }]
        };

        // 3. Define the final chunk with `finish_reason: "tool_calls"`
        // This is the critical step to prevent loops, as explained in the guide.
        const finalChunkPayload = {
            id: toolCallPayload.id,
            object: "chat.completion.chunk",
            created: toolCallPayload.created,
            model: toolCallPayload.model,
            choices: [{
                index: 0,
                delta: {},
                finish_reason: "tool_calls"
            }]
        };

        // 4. Write the chunks to the response stream in the correct order
        console.log("Sending tool_calls chunk...");
        res.write(`data: ${JSON.stringify(toolCallPayload)}\n\n`);

        console.log("Sending finish_reason chunk...");
        res.write(`data: ${JSON.stringify(finalChunkPayload)}\n\n`);

        // 5. Send the final [DONE] message to terminate the stream
        console.log("Sending [DONE] message...");
        res.write('data: [DONE]\n\n');

        // 6. End the response
        res.end();
        console.log("Stream ended.");

    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

server.listen(3000, () => {
    console.log('Bulletproof Fake OpenAI server (from test) running on http://localhost:3000');
});
