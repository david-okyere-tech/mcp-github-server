import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: process.env.GITHUB_PERSONAL_ACCESS_TOKEN });

function buildServer() {
  const server = new McpServer({ name: "github-mcp", version: "1.0.0" });
  server.tool(
    "list_repositories",
    "List repositories for the authenticated user",
    {},
    async () => {
      const res = await octokit.rest.repos.listForAuthenticatedUser({ per_page: 20 });
      return {
        content: [{ type: "text", text: JSON.stringify(res.data.map(r => r.full_name)) }]
      };
    }
  );
  return server;
}

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  console.log("[POST /mcp] Accept:", req.headers.accept);
  console.log("[POST /mcp] Body:", JSON.stringify(req.body));
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    console.log("[POST /mcp] handled, status:", res.statusCode);
  } catch (err) {
    console.error("[POST /mcp] ERROR:", err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

app.get("/mcp", (req, res) => res.status(405).end());
app.delete("/mcp", (req, res) => res.status(405).end());

const port = process.env.PORT || 8080;
app.listen(port, "0.0.0.0", () => console.log(`listening on ${port}`));
