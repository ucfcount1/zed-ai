const express = require('express');
const app = express();
const port = 3000;

app.use(express.json({ limit: '10mb' }));

// Enable CORS for Zed
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// This is the corrected OpenAI Chat Completions API endpoint.
app.post('/v1/chat/completions', (req, res) => {
  console.log('=== REQUEST RECEIVED ===');
  console.log('Stream:', req.body.stream);
  console.log('Model:', req.body.model);

  // Set streaming headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const requestId = "chatcmpl-" + Date.now();
  const timestamp = Math.floor(Date.now() / 1000);

  // Generate dynamic content for the files
  const content1 = `function calculate(num1, num2, operation) {
  num1 = Number(num1);
  num2 = Number(num2);
  if (isNaN(num1) || isNaN(num2)) { return "Error: Invalid input numbers"; }
  switch (operation.toLowerCase()) {
    case "addition": case "add": case "+": return num1 + num2;
    case "subtraction": case "subtract": case "-": return num1 - num2;
    case "multiplication": case "multiply": case "*": return num1 * num2;
    case "division": case "divide": case "/":
      if (num2 === 0) { return "Error: Division by zero"; }
      return num1 / num2;
    case "modulo": case "mod": case "%":
      if (num2 === 0) { return "Error: Modulo by zero"; }
      return num1 % num2;
    default: return "Error: Invalid operation type";
  }
}
// Example usage:
console.log(calculate(10, 3, "modulo")); // 1
`;
  const content2 = `function calculate(num1, num2, operation) {
  switch (operation.toLowerCase()) {
    case "add": case "+": return num1 + num2;
    case "subtract": case "-": return num1 - num2;
    case "modulo": case "mod": case "%":
      if (num2 === 0) { throw new Error('Modulo by zero is not allowed'); }
      return num1 % num2;
    default: throw new Error('Invalid operation. Use "add", "subtract", or "modulo"');
  }
}
// Example usage:
console.log(calculate(15, 4, "%")); // 3
`;

  // THE FIX IS HERE:
  // Instead of sending two separate chunks with one tool_call each, we send a single chunk
  // with a `tool_calls` array containing both operations. This is the correct way to
  // instruct the model to perform multiple tool actions in one turn.
  const toolCallsPayload = {
    id: requestId,
    object: "chat.completion.chunk",
    created: timestamp,
    model: "gpt-4", // Or whatever model Zed is requesting
    choices: [{
      index: 0,
      delta: {
        tool_calls: [
          {
            index: 0, // First tool call
            id: "call_edit_test1_" + Date.now(),
            type: "function",
            function: {
              name: "edit_file",
              arguments: JSON.stringify({
                display_description: "Add modulo operation to calculate function in test.js",
                path: "test.js", // Assuming test.js is at the project root
                mode: "overwrite",
                content: content1
              })
            }
          },
          {
            index: 1, // Second tool call
            id: "call_edit_test2_" + Date.now(),
            type: "function",
            function: {
              name: "edit_file",
              arguments: JSON.stringify({
                display_description: "Add modulo operation to calculate function in test2.js",
                path: "test2.js", // Assuming test2.js is at the project root
                mode: "overwrite",
                content: content2
              })
            }
          }
        ]
      },
      finish_reason: null
    }]
  };

  // This final chunk signals that the turn is finished because of the tool calls.
  const finalChunk = {
    id: requestId,
    object: "chat.completion.chunk",
    created: timestamp,
    model: "gpt-4",
    choices: [{
      index: 0,
      delta: {},
      finish_reason: "tool_calls"
    }]
  };

  console.log('*** SENDING COMBINED TOOL CALL CHUNK ***');
  res.write(`data: ${JSON.stringify(toolCallsPayload)}\n\n`);

  console.log('*** SENDING FINAL CHUNK ***');
  res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);

  console.log('*** SENDING [DONE] SIGNAL ***');
  res.write('data: [DONE]\n\n');
  res.end();
  console.log('*** STREAM COMPLETED ***');
});

// Health check and other endpoints remain the same...
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`🚀 Fixed Fake OpenAI API server running at http://localhost:${port}`);
});
