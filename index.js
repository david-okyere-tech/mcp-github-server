import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Octokit } from "@octokit/rest";

const app = express();

// 1. Bulletproof CORS & Logging Middleware
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url}`);
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-custom-header");
  
  // Instantly approve CORS preflight checks
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

app.use(express.json());

const port = process.env.PORT || 8080;
const octokit = new Octokit({ auth: process.env.GITHUB_PERSONAL_ACCESS_TOKEN });

const server = new Server(
  { name: "github-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_repositories",
      description: "List repositories for authenticated user",
      inputSchema: { type: "object", properties: {} }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  if (name === "list_repositories") {
    try {
      const res = await octokit.rest.repos.listForAuthenticatedUser({ per_page: 10 });
      return {
        content: [{ type: "text", text: JSON.stringify(res.data.map(r => r.full_name)) }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: err.message }] };
    }
  }
});

let transport = null;

// 2. The exact SSE route Gemini needs
app.get("/sse", async (req, res) => {
  console.log("[SSE] New connection initializing...");
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
  console.log("[SSE] Connection established.");
});

// 3. The exact POST route for messages
app.post("/messages", async (req, res) => {
  console.log("[POST] Message received.");
  if (transport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(400).send("No active SSE session");
  }
});

app.get("/", (req, res) => {
  res.send("GitHub MCP SSE Server Running");
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);
});
