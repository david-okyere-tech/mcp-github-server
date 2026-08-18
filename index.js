import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Octokit } from "@octokit/rest";

const app = express();
app.use(cors());
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
    },
    {
      name: "get_file_contents",
      description: "Get contents of a file in a GitHub repo",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          path: { type: "string" }
        },
        required: ["owner", "repo", "path"]
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    if (name === "list_repositories") {
      const res = await octokit.rest.repos.listForAuthenticatedUser({ per_page: 20 });
      return {
        content: [{ type: "text", text: JSON.stringify(res.data.map(r => ({ name: r.name, full_name: r.full_name, url: r.html_url }))) }]
      };
    }
    if (name === "get_file_contents") {
      const res = await octokit.rest.repos.getContent({
        owner: args.owner,
        repo: args.repo,
        path: args.path
      });
      const content = Buffer.from(res.data.content, "base64").toString("utf-8");
      return { content: [{ type: "text", text: content }] };
    }
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: err.message }] };
  }
});

let transport = null;

app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
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
