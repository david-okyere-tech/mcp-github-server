import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Octokit } from "@octokit/rest";

const app = express();

app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url}`);
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-custom-header");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.get("/sse", async (req, res) => {
  console.log("[SSE] New connection initializing...");
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
  console.log("[SSE] Connection established.");
});

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

// --- FAKE OAUTH FLOW FOR GEMINI ---

// 1. Tell Gemini where the fake auth endpoints are
app.get(["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/sse"], (req, res) => {
  const baseUrl = `https://${req.headers.host}`;
  res.status(200).json({
    authorization_endpoint: `${baseUrl}/auth`,
    token_endpoint: `${baseUrl}/token`,
    scopes_supported: ["all"]
  });
});

// 2. Catch the browser redirect and instantly redirect back to Gemini with a fake code
app.get("/auth", (req, res) => {
  const redirectUri = req.query.redirect_uri;
  const state = req.query.state;
  console.log(`[OAUTH] Authorize requested. Redirecting back to: ${redirectUri}`);
  res.redirect(`${redirectUri}?code=mock_auth_code_123&state=${state}`);
});

// 3. Give Gemini a fake access token when it trades in the code
app.post("/token", (req, res) => {
  console.log("[OAUTH] Token requested. Sending mock token.");
  res.status(200).json({
    access_token: "mock_access_token_456",
    token_type: "Bearer",
    expires_in: 3600
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);
});
