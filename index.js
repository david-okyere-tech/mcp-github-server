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

// Stateless: a fresh server+transport per request. Simplest thing that works.
app.post("/mcp", async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
app.get("/mcp", (req, res) => res.status(405).end());
app.delete("/mcp", (req, res) => res.status(405).end());

const port = process.env.PORT || 8080;
app.listen(port, "0.0.0.0", () => console.log(`listening on ${port}`));
