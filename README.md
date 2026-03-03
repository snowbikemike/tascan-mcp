# TaScan MCP Server

AI agent integration for [TaScan](https://tascan.io) — the universal task protocol platform. Manage projects, events, tasks, workers, QR codes, templates, and completion reports through Claude, GitHub Copilot, or any MCP-compatible AI client.

**Scan. Task. Done.**

## What is TaScan?

TaScan is a zero-download task assignment and verification platform for physical-world work. Workers scan a QR code, complete tasks with photo verification, and managers get real-time completion reports — no app download, no login, no training required.

Industries: live events, construction, hospitality, warehousing, property management, healthcare, aviation, FEMA disaster response, and more.

## Installation

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
| `TASCAN_API_URL` | No | API base URL (default: `https://tascan-live-event.netlify.app/api/v1`) |

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

## Tools (22)

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
| `tascan_get_report` | Get completion report for an event | Read |

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

### Example 2: Check event completion status

```
User: How's the hotel room turnover going for the Marriott project? Which rooms still need to be finished?

Claude will:
1. Call tascan_list_projects to find the Marriott project
2. Call tascan_list_events to find active room turnovers
3. Call tascan_get_report for each event to show completion rates
4. Summarize which tasks are incomplete and which workers are assigned
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

### Example 4: Manage workers across multiple events

```
User: Show me all our workers and which events they've completed this week. Flag anyone with a reliability score below 80%.

Claude will:
1. Call tascan_list_workers to get all worker profiles
2. Call tascan_list_projects and tascan_list_events to enumerate active events
3. Call tascan_get_report for each event to check worker completions
4. Analyze completion data and flag underperforming workers
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

1. Log in to the [TaScan Admin Portal](https://tascan-live-event.netlify.app)
2. Navigate to **Team** in the sidebar
3. Scroll to **API Keys**
4. Click **Generate API Key**
5. Copy the key (it's only shown once)
6. Set it as `TASCAN_API_KEY` in your environment

API keys are scoped to your organization and support rate limiting (60 requests/minute).

## Privacy Policy

TaScan collects and processes task completion data, worker information (name, phone, email), GPS coordinates (with consent), and photos uploaded during task completion. Data is stored securely in Supabase with row-level security policies. API access is authenticated and rate-limited.

For the full privacy policy, visit: https://tascan.io/privacy

For data deletion requests or privacy inquiries, contact: Michael@TaScan.io

## Support

- **Email:** Michael@TaScan.io
- **Website:** https://tascan.io
- **Issues:** https://github.com/snowbikemike/tascan-mcp/issues

## License

MIT License - Copyright (c) 2026 Michael Edward Love II / Love Productions LLC
