# TaScan MCP Server

AI agent integration for [TaScan](https://tascan.io) — the closed-loop autonomous operations protocol. Manage projects, events, tasks, workers, QR codes, templates, completion reports, and AI-powered issue resolution through Claude, GitHub Copilot, or any MCP-compatible AI client.

**Task. Scan. Done.**

## What is TaScan?

TaScan is a zero-download task assignment and verification platform for physical-world work. Workers scan a QR code, complete tasks with photo verification, and managers get real-time completion reports — no app download, no login, no training required.

When something breaks, AI analyzes the issue, generates fix instructions, and dispatches them to the right worker — closing the loop autonomously in under 10 seconds.

Industries: live events, construction, hospitality, warehousing, property management, healthcare, aviation, FEMA disaster response, and more.

**10 Provisional Patents Filed** — 265 claims, ~1000+ pages of specification. USPTO Applications #63/995,189 through #64/001,286.

## Quickest Start: Claude.ai / Claude Mobile

No install required. Add TaScan as a custom connector in Claude:

1. **Settings > Connectors > Add custom connector**
2. Enter: `https://app.tascan.io/mcp`
3. First time you use a tool, sign in with your TaScan email and password

That's it. Works on claude.ai and Claude mobile. Same sign-in experience as GitHub, Netlify, and Supabase connectors.

---

## Installation (Claude Desktop / Claude Code)

```bash
npm install tascan-mcp
```

Or run directly with npx:

```bash
npx tascan-mcp
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TASCAN_API_KEY` | Yes | Your TaScan API key (generate in Admin Portal > Team > API Keys) |
| `TASCAN_API_URL` | No | API base URL (default: `https://app.tascan.io/api/v1`) |

### Claude Desktop

Add to your Claude Desktop config file (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tascan": {
      "command": "npx",
      "args": ["-y", "tascan-mcp"],
      "env": {
        "TASCAN_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add tascan -- npx -y tascan-mcp
```

Then set your API key in the environment.

### Remote (claude.ai / Claude Mobile)

TaScan MCP is also available as a remote server — no install, no API key needed:

```
https://app.tascan.io/mcp
```

Add as a custom connector in Claude (Settings > Connectors). When you first use a tool, you'll be redirected to sign in with your TaScan email and password — just like connecting GitHub or Netlify. OAuth 2.0 with PKCE handles everything automatically.

## Tools (36)

### Projects
| Tool | Description | Type |
|------|-------------|------|
| `tascan_list_projects` | List all projects in the organization | Read |
| `tascan_get_project` | Get details of a specific project | Read |
| `tascan_create_project` | Create a new project | Create |
| `tascan_update_project` | Update project name, location, status, dates | Update |
| `tascan_delete_project` | Delete a project and all its contents | Delete |

### Events (Task Lists)
| Tool | Description | Type |
|------|-------------|------|
| `tascan_list_events` | List all events within a project | Read |
| `tascan_get_event` | Get event details including tasks | Read |
| `tascan_create_event` | Create a new event in a project | Create |
| `tascan_update_event` | Update event name, description, modes | Update |
| `tascan_delete_event` | Delete an event and all its tasks | Delete |

### Tasks
| Tool | Description | Type |
|------|-------------|------|
| `tascan_list_tasks` | List all tasks in an event | Read |
| `tascan_get_task` | Get task details including completions | Read |
| `tascan_add_tasks` | Bulk-create tasks in an event | Create |
| `tascan_update_task` | Update task title, type, flags, order | Update |
| `tascan_delete_task` | Delete a task and its completions | Delete |

### Workers
| Tool | Description | Type |
|------|-------------|------|
| `tascan_list_workers` | List all workers in the organization | Read |
| `tascan_create_worker` | Create a new worker profile | Create |
| `tascan_update_worker` | Update worker name, phone, email | Update |

### Operations
| Tool | Description | Type |
|------|-------------|------|
| `tascan_generate_qr` | Generate a QR code for an event | Create |
| `tascan_apply_template` | Apply a pre-built template to an event | Create |
| `tascan_list_templates` | List available task templates | Read |
| `tascan_get_report` | Get completion report for an event (optional `include_responses` returns submitted response data) | Read |
| `tascan_query_responses` | One task's responses across every list in a project — chronological progression series | Read |

### Closed-Loop Autonomous Operations (Patent Pending)
| Tool | Description | Type |
|------|-------------|------|
| `tascan_list_issues` | List field-reported issues with filtering by status, category, severity | Read |
| `tascan_analyze_issue` | AI classifies issue severity, identifies root cause, and scores urgency | AI |
| `tascan_recommend_fix` | AI generates ranked remediation tasks with step-by-step instructions | AI |
| `tascan_auto_resolve` | Full closed loop in ONE call — issue in, AI analyzes, fix dispatched, loop closes | AI |

### Communications
| Tool | Description | Type |
|------|-------------|------|
| `tascan_dispatch_instruction` | Multi-channel delivery of instructions to workers (SMS, email, QR) | Create |
| `tascan_send_task_email` | Send task links and notifications via email | Create |
| `tascan_complete_task` | Mark a task as completed with optional response data | Update |

### AI Agent Coordination (Patent #10)
| Tool | Description | Type |
|------|-------------|------|
| `tascan_list_agents` | List registered AI agents in the system | Read |
| `tascan_register_agent` | Register a new AI agent with capabilities | Create |
| `tascan_dispatch_to_agent` | Route a task to a specific AI agent for execution | Create |

## Usage Examples

### Example 1: Set up a construction site inspection

```
User: Create a construction project for the Downtown Tower site and set up a daily safety inspection with tasks for PPE check, fall protection, scaffolding inspection, and fire extinguisher check. Make all tasks safety checkpoints that require photos.

Claude will:
1. Call tascan_create_project with name "Downtown Tower" and location "123 Main St"
2. Call tascan_create_event with name "Daily Safety Inspection"
3. Call tascan_add_tasks with 4 safety checkpoint tasks requiring photos
4. Call tascan_generate_qr to create a scannable QR code for the foreman
```

### Example 2: AI-powered autonomous issue resolution

```
User: Check if there are any open issues on the Marriott load-in and have TaScan fix them automatically.

Claude will:
1. Call tascan_list_issues to find open issues
2. Call tascan_auto_resolve for each issue — AI analyzes root cause, generates fix tasks, and dispatches instructions to the nearest qualified worker via SMS
3. Report back with resolution status and confidence scores
```

### Example 3: Use templates to quickly deploy an event

```
User: We have a warehouse receiving shipment coming in tomorrow. Set up the standard receiving checklist.

Claude will:
1. Call tascan_list_templates with category "logistics" to find available templates
2. Call tascan_create_project for the warehouse
3. Call tascan_create_event for the receiving session
4. Call tascan_apply_template with the "warehouse-receiving" template slug
5. Call tascan_generate_qr for the receiving dock crew
```

### Example 4: Analyze and triage field issues

```
User: We have 5 open issues on the concert setup. Analyze them all and tell me which ones are most urgent.

Claude will:
1. Call tascan_list_issues to get all open issues
2. Call tascan_analyze_issue for each one — AI classifies severity, root cause probability, and urgency score
3. Rank by urgency and recommend which to auto-resolve vs which need human attention
```

## Task Types

Tasks support multiple response types:

| Type | Description |
|------|-------------|
| `checkbox` | Simple done/not-done (default) |
| `photo` | Requires photo upload to complete |
| `text` | Free-text response |
| `number` | Numeric response |
| `date` | Date selection |
| `choice` | Multiple choice selection |

Tasks can also be flagged as:
- **Safety checkpoints** (`is_safety_checkpoint: true`) — highlighted in red, cannot be skipped
- **Photo required** (`requires_photo: true`) — worker must attach a photo to complete

## Getting an API Key

1. Log in to the [TaScan Admin Portal](https://app.tascan.io)
2. Navigate to **Team** in the sidebar
3. Scroll to **API Keys**
4. Click **Generate API Key**
5. Copy the key (it's only shown once)
6. Set it as `TASCAN_API_KEY` in your environment

API keys are scoped to your organization and support rate limiting (60 requests/minute).

## Troubleshooting

**"Connection failed" or OAuth redirect issues**
- Verify you're using the correct URL: `https://app.tascan.io/mcp`
- Clear your browser cache and try reconnecting
- If using Claude Desktop, restart the app after adding the connector

**"Unauthorized" or 401 errors (local npm install)**
- Regenerate your API key in Admin Portal > Team > API Keys
- Confirm `TASCAN_API_KEY` is set in your environment (not just in the config file)
- Keys are organization-scoped — make sure you're using a key from the correct org

**Tools not showing up in Claude**
- Disconnect and reconnect the TaScan connector
- For Claude Code: run `claude mcp list` to verify the server is registered
- Check that your TaScan account has an active organization (free tier is fine)

**"Rate limited" errors**
- Default limit is 60 requests/minute per API key
- Pro and Business tiers have higher limits
- Batch operations (like `tascan_add_tasks`) are more efficient than individual calls

**Task completions not appearing**
- Workers must submit via the task link (QR scan or direct URL)
- Photo-required tasks won't show as complete until the photo uploads
- Check the event's response mode (single vs. multi-response)

## Privacy Policy

TaScan collects and processes task completion data, worker information (name, phone, email), GPS coordinates (with consent), and photos uploaded during task completion. Data is stored securely in Supabase with row-level security policies. API access is authenticated and rate-limited.

For the full privacy policy, visit: https://tascan.io/faq.html

For data deletion requests or privacy inquiries, contact: Michael@TaScan.io

## Support

- **Email:** Michael@TaScan.io
- **Website:** https://tascan.io
- **Issues:** https://github.com/snowbikemike/tascan-mcp/issues

## License

MIT License - Copyright (c) 2026 Michael Edward Love II / Love Productions LLC
