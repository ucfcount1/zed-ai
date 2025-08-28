const express = require("express");
const cors = require("cors");
const app = express();

app.use(express.json());
app.use(cors());

// This server demonstrates how to edit two files in a single turn.
app.post("/chat/completions", (req, res) => {
  console.log("Multi-file edit request received:", JSON.stringify(req.body, null, 2));

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const hasToolResults = req.body.messages.some((msg) => msg.role === "tool");

  if (hasToolResults) {
    // This is the follow-up request after the tools have been executed by Zed.
    // We can now send the final confirmation message.
    console.log("Follow-up request detected. Sending final confirmation.");

    res.write(
      `data: ${JSON.stringify({
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "ucf-multi-file-finalizer",
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: "Done! I have modified both test1.js and test2.js.",
            },
            finish_reason: null,
          },
        ],
      })}\n\n`
    );

    // Final chunk with "stop" reason, since this is the end of the conversation turn.
    res.write(
      `data: ${JSON.stringify({
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "ucf-multi-file-finalizer",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      })}\n\n`
    );

    res.write("data: [DONE]\n\n");
    res.end();

  } else {
    // This is the initial request. Send the tool calls to edit two files.
    console.log("Initial request. Sending multiple tool_calls.");

    const toolCallId1 = `call_edit_1_${Date.now()}`;
    const toolCallId2 = `call_edit_2_${Date.now()}`;

    // The key is to put both tool call objects into the same `tool_calls` array
    // within a single SSE message.
    const multiToolCallPayload = {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: "ucf-multi-file-editor",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: toolCallId1,
                type: "function",
                function: {
                  name: "edit_file",
                  arguments: JSON.stringify({
                    display_description: "Update test1.js",
                    path: "test1.js",
                    mode: "overwrite",
                    content: "console.log('This is test1.js, updated by multi-file edit.');",
                  }),
                },
              },
              {
                index: 1, // The index must be unique for each tool call in the array
                id: toolCallId2,
                type: "function",
                function: {
                  name: "edit_file",
                  arguments: JSON.stringify({
                    display_description: "Update test2.js",
                    path: "test2.js",
                    mode: "overwrite",
                    content: "console.log('This is test2.js, also updated by multi-file edit.');",
                  }),
                },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    };

    res.write(`data: ${JSON.stringify(multiToolCallPayload)}\n\n`);

    // Now, send the final chunk with `finish_reason: "tool_calls"` to signal the end of the tool sequence.
    const finalChunkPayload = {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: "ucf-multi-file-editor",
      choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
    };

    res.write(`data: ${JSON.stringify(finalChunkPayload)}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Multi-file edit server for Zed started on port ${PORT}`);
});
