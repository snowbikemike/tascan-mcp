// ============================================================
// TaScan MCP — canonical tool registry (single source of truth)
// ============================================================
// Consumed by BOTH transports:
//   - index.js (stdio, npm package `tascan-mcp`, Claude Desktop/Code)
//   - live-event/netlify/functions/mcp-endpoint.js (remote HTTP,
//     https://app.tascan.io/mcp, claude.ai connector + MCP Directory)
//
// Every tool: { name, description, inputSchema (JSON Schema),
//   annotations, handler(args, api) } where api(method, path, body)
// is the transport-bound REST call to app.tascan.io/api/v1.
// Handlers return a plain string; the transport wraps it in MCP
// content blocks.
// ============================================================

// ─── Response display normalization ─────────────────────
// The worker app stores the clean value in response_value AND a raw
// submission blob {"type","value","submitted_at"} in notes for typed
// tasks; for checkbox tasks the human text lives only in notes.
// Collapse to one display value, never print the blob.
function fmtResponse(responseValue, notes) {
  let value = responseValue;
  if (value && typeof value === 'object') {
    value = ('value' in value) ? value.value : JSON.stringify(value);
  }
  let note = notes || null;
  if (note && typeof note === 'string' && note.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(note);
      if (parsed && typeof parsed === 'object' && 'value' in parsed) {
        if (value == null || value === '') value = parsed.value;
        note = null; // pure duplicate of response_value — drop the blob
      }
    } catch { /* plain text note that happens to start with { — keep it */ }
  }
  if ((value == null || value === '') && note) {
    // checkbox task with a typed note — the note IS the data
    value = note;
    note = null;
  }
  return { value: value == null || value === '' ? null : String(value), note };
}

const AGENT_REGISTRY = [
  {
    id: 'claude-code-local',
    name: 'Claude Code',
    type: 'local',
    model: 'claude-opus-4-6',
    worker_id: '9d194a8e-0c38-4cba-ba62-8560e497a0c3',
    inbox_id: 'f745d0fa-421a-42e5-85be-0a3f9acd28e8',
    capabilities: ['CODE', 'SHELL', 'PLAN', 'WRITE', 'RESEARCH', 'DEFAULT'],
    location: 'Las Vegas, NV (Mike\'s PC)',
    status: 'active',
    description: 'Local Claude Code agent on Mike\'s PC. Spawns claude -p for code/shell tasks. Full filesystem + tool access. Picks up tasks from AI Inbox via Supabase Realtime.'
  },
  {
    id: 'cloud-agent',
    name: 'Cloud Agent',
    type: 'cloud',
    model: 'claude-haiku-4-5-20251001',
    worker_id: '9d194a8e-0c38-4cba-ba62-8560e497a0c3',
    inbox_id: 'f745d0fa-421a-42e5-85be-0a3f9acd28e8',
    capabilities: ['RESEARCH', 'WRITE', 'REVIEW', 'MCP', 'DEFAULT'],
    location: 'Netlify (cloud)',
    status: 'active',
    description: 'Cloud agent via Netlify function (agent-execute.js). Uses Anthropic API for RESEARCH/WRITE tasks. Triggered by Supabase pg_net webhook on task insert.'
  }
];
// Dynamic registry entries (from tascan_register_agent calls within this session)
const dynamicAgents = [];

const TOOLS = [
  {
    name: 'tascan_list_projects',
    description: 'List all TaScan projects in the organization',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'List Projects', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      const result = await api('GET', '/projects');
      return JSON.stringify(result.data, null, 2);
    }
  },
  {
    name: 'tascan_create_project',
    description: 'Create a new TaScan project (top-level container for events)',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
        location: { type: 'string', description: 'Project location / venue' }
      },
      required: ['name']
    },
    annotations: { title: 'Create Project', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args, api) => {
      const result = await api('POST', '/projects', { name: args.name, location: args.location });
      return `Project created: ${result.data.name} (ID: ${result.data.id})\n\n${JSON.stringify(result.data, null, 2)}`;
    }
  },
  {
    name: 'tascan_get_project',
    description: 'Get details of a specific project',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string', description: 'Project ID' } },
      required: ['project_id']
    },
    annotations: { title: 'Get Project', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      const result = await api('GET', `/projects/${args.project_id}`);
      return JSON.stringify(result.data, null, 2);
    }
  },
  {
    name: 'tascan_update_project',
    description: 'Update a project (name, location, status, dates)',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        name: { type: 'string', description: 'New name' },
        location: { type: 'string', description: 'New location' },
        status: { type: 'string', enum: ['active', 'archived'], description: 'Status' },
        start_date: { type: 'string', description: 'Start date (ISO)' },
        end_date: { type: 'string', description: 'End date (ISO)' }
      },
      required: ['project_id']
    },
    annotations: { title: 'Update Project', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      const { project_id, ...updates } = args;
      const body = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
      const result = await api('PUT', `/projects/${project_id}`, body);
      return `Project updated: ${result.data.name}\n\n${JSON.stringify(result.data, null, 2)}`;
    }
  },
  {
    name: 'tascan_delete_project',
    description: 'Delete a project and all its events, tasks, and completions. This action is irreversible.',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string', description: 'Project ID to delete' } },
      required: ['project_id']
    },
    annotations: { title: 'Delete Project', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      await api('DELETE', `/projects/${args.project_id}`);
      return `Project ${args.project_id} deleted successfully.`;
    }
  },
  {
    name: 'tascan_create_event',
    description: 'Create a new event (task list) within a project. Supports team_mode (shared completions) and multi_instance (each worker gets isolated copy — great for surveys, onboarding, info collection). team_mode and multi_instance cannot both be true.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        name: { type: 'string', description: 'Event name' },
        description: { type: 'string', description: 'Event description' },
        team_mode: { type: 'boolean', description: 'Team mode — shared completions' },
        multi_instance: { type: 'boolean', description: 'Multi-instance — each worker gets isolated copy' }
      },
      required: ['project_id', 'name']
    },
    annotations: { title: 'Create Event', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args, api) => {
      const body = { name: args.name, description: args.description };
      if (args.team_mode !== undefined) body.team_mode = args.team_mode;
      if (args.multi_instance !== undefined) body.multi_instance = args.multi_instance;
      const result = await api('POST', `/projects/${args.project_id}/lists`, body);
      return `Event created: ${result.data.name} (ID: ${result.data.id})\n\n${JSON.stringify(result.data, null, 2)}`;
    }
  },
  {
    name: 'tascan_list_events',
    description: 'List all events (task lists) within a project',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string', description: 'Project ID' } },
      required: ['project_id']
    },
    annotations: { title: 'List Events', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      const result = await api('GET', `/projects/${args.project_id}/lists`);
      return JSON.stringify(result.data, null, 2);
    }
  },
  {
    name: 'tascan_get_event',
    description: 'Get details of a specific event (task list) including its tasks',
    inputSchema: {
      type: 'object',
      properties: { list_id: { type: 'string', description: 'Task list (event) ID' } },
      required: ['list_id']
    },
    annotations: { title: 'Get Event', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      const result = await api('GET', `/lists/${args.list_id}`);
      return JSON.stringify(result.data, null, 2);
    }
  },
  {
    name: 'tascan_update_event',
    description: 'Update an event / task list (name, description, team_mode, multi_instance, timer_mode). team_mode and multi_instance cannot both be true.',
    inputSchema: {
      type: 'object',
      properties: {
        list_id: { type: 'string', description: 'Task list (event) ID' },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'New description' },
        team_mode: { type: 'boolean', description: 'Team mode — shared completions' },
        multi_instance: { type: 'boolean', description: 'Multi-instance — each worker gets isolated copy' },
        timer_mode: { type: 'string', description: 'Timer mode (auto or manual)' }
      },
      required: ['list_id']
    },
    annotations: { title: 'Update Event', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      const { list_id, ...updates } = args;
      const body = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
      const result = await api('PUT', `/lists/${list_id}`, body);
      return `Event updated: ${result.data.name}\n\n${JSON.stringify(result.data, null, 2)}`;
    }
  },
  {
    name: 'tascan_delete_event',
    description: 'Delete an event (task list) and all its tasks and completions. This action is irreversible.',
    inputSchema: {
      type: 'object',
      properties: { list_id: { type: 'string', description: 'Task list (event) ID to delete' } },
      required: ['list_id']
    },
    annotations: { title: 'Delete Event', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      await api('DELETE', `/lists/${args.list_id}`);
      return `Event ${args.list_id} deleted successfully.`;
    }
  },
  {
    name: 'tascan_add_tasks',
    description: 'Add one or more tasks to an event (task list). Supports bulk creation. IMPORTANT: Set response_type correctly — use "text" for info collection (names, phones, emails, notes), "photo" for visual verification (inspections, serial numbers, damage checks), "checkbox" only for simple confirmations. NOTE: To dispatch tasks to the Claude Code agent running on Mike\'s PC, use tascan_dispatch_to_agent instead — it routes directly to the agent\'s inbox with zero configuration needed.',
    inputSchema: {
      type: 'object',
      properties: {
        list_id: { type: 'string', description: 'Task list (event) ID' },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Task title' },
              description: { type: 'string', description: 'Task description' },
              response_type: { type: 'string', enum: ['checkbox', 'photo', 'text', 'number', 'date', 'choice'], description: 'CRITICAL: "text" for names, phones, emails, notes, addresses, any free-form input. "photo" for tasks needing photographic proof (inspections, serial numbers, packed cases). "checkbox" ONLY for simple yes/no confirmations. "number" for numeric values. "date" for dates. "choice" for multiple-choice (needs response_config.options). Most info-collection tasks should be "text", most verification tasks should be "photo".' },
              is_safety_checkpoint: { type: 'boolean', description: 'Safety-critical task flag' },
              requires_photo: { type: 'boolean', description: 'Require photo on completion' }
            },
            required: ['title']
          },
          description: 'Array of tasks to create'
        }
      },
      required: ['list_id', 'tasks']
    },
    annotations: { title: 'Add Tasks', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args, api) => {
      const result = await api('POST', `/lists/${args.list_id}/tasks`, args.tasks);
      return `${result.count} task(s) created in list ${args.list_id}\n\n${JSON.stringify(result.data, null, 2)}`;
    }
  },
  {
    name: 'tascan_dispatch_to_agent',
    description: 'PREFERRED tool for sending work to an AI agent. Dispatches a task to the agent\'s inbox — picked up and executed automatically. No list ID needed. Supports prefixes: CODE: SHELL: RESEARCH: WRITE: PLAN: for routing. Use "agent" param to target a specific agent (default: claude-code-local). Use tascan_list_agents to discover available agents.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'The task description. Prefix with CODE: SHELL: RESEARCH: WRITE: PLAN: for routing, or just plain text.' },
        agent: { type: 'string', description: 'Agent ID or name to dispatch to (default: claude-code-local). Use tascan_list_agents to see options.' },
        priority: { type: 'string', enum: ['normal', 'urgent'], description: 'Priority level (default: normal)' }
      },
      required: ['task']
    },
    annotations: { title: 'Dispatch to AI Agent', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (args, api) => {
      const allAgents = [...AGENT_REGISTRY, ...dynamicAgents];
      const agentQuery = (args.agent || 'claude-code-local').toLowerCase();
      const agent = allAgents.find(a => a.id === agentQuery || a.name.toLowerCase() === agentQuery) || allAgents[0];
      const title = args.priority === 'urgent' ? `🔴 ${args.task}` : args.task;
      const result = await api('POST', `/lists/${agent.inbox_id}/tasks`, [{ title, response_type: 'text' }]);
      return `Task dispatched to ${agent.name}!\n\nAgent: ${agent.name} (${agent.id})\nType: ${agent.type}\nLocation: ${agent.location}\nTask: ${title}\nStatus: Queued — agent will pick this up automatically.\n\n${JSON.stringify(result.data, null, 2)}`;
    }
  },
  {
    name: 'tascan_list_agents',
    description: 'List all registered AI agents with their capabilities, inbox IDs, and status. Like reading input labels on a video matrix — discover which agents are available and what they can do before dispatching work.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    annotations: { title: 'List AI Agents', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async () => {
      const allAgents = [...AGENT_REGISTRY, ...dynamicAgents];
      const summary = allAgents.map(a =>
        `${a.name} (${a.id})\n  Type: ${a.type} | Model: ${a.model}\n  Worker ID: ${a.worker_id}\n  Inbox: ${a.inbox_id}\n  Capabilities: ${a.capabilities.join(', ')}\n  Location: ${a.location}\n  Status: ${a.status}\n  ${a.description}`
      ).join('\n\n');
      return `${allAgents.length} registered agent(s):\n\n${summary}`;
    }
  },
  {
    name: 'tascan_register_agent',
    description: 'Register a new AI agent in the agent registry. The agent will appear in tascan_list_agents and can receive dispatched tasks. Self-registration for AI agents joining the TaScan network.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique agent ID (e.g. "my-agent-1")' },
        name: { type: 'string', description: 'Display name (e.g. "Research Bot")' },
        type: { type: 'string', enum: ['local', 'cloud', 'hybrid'], description: 'Agent type' },
        model: { type: 'string', description: 'Model powering this agent (e.g. "claude-sonnet-4-6")' },
        worker_id: { type: 'string', description: 'TaScan worker ID for this agent' },
        inbox_id: { type: 'string', description: 'Task list ID this agent monitors for new tasks' },
        capabilities: { type: 'array', items: { type: 'string' }, description: 'Task type prefixes this agent handles (e.g. ["RESEARCH", "WRITE"])' },
        location: { type: 'string', description: 'Where the agent runs (e.g. "AWS us-east-1")' },
        description: { type: 'string', description: 'What this agent does' }
      },
      required: ['id', 'name', 'type', 'inbox_id', 'capabilities']
    },
    annotations: { title: 'Register AI Agent', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args) => {
      const existing = [...AGENT_REGISTRY, ...dynamicAgents].find(a => a.id === args.id);
      if (existing) {
        Object.assign(existing, args, { status: 'active' });
        return `Agent "${args.name}" (${args.id}) updated in registry.\n\n${JSON.stringify(existing, null, 2)}`;
      }
      const agent = {
        id: args.id,
        name: args.name,
        type: args.type,
        model: args.model || 'unknown',
        worker_id: args.worker_id || 'unassigned',
        inbox_id: args.inbox_id,
        capabilities: args.capabilities || ['DEFAULT'],
        location: args.location || 'unknown',
        status: 'active',
        description: args.description || `${args.name} agent`
      };
      dynamicAgents.push(agent);
      return `Agent "${args.name}" registered!\n\nID: ${agent.id}\nInbox: ${agent.inbox_id}\nCapabilities: ${agent.capabilities.join(', ')}\nStatus: active\n\nUse tascan_dispatch_to_agent with agent="${agent.id}" to send tasks.\n\n${JSON.stringify(agent, null, 2)}`;
    }
  },
  {
    name: 'tascan_list_tasks',
    description: 'List all tasks in an event (task list)',
    inputSchema: {
      type: 'object',
      properties: { list_id: { type: 'string', description: 'Task list (event) ID' } },
      required: ['list_id']
    },
    annotations: { title: 'List Tasks', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      const result = await api('GET', `/lists/${args.list_id}/tasks`);
      return JSON.stringify(result.data, null, 2);
    }
  },
  {
    name: 'tascan_get_task',
    description: 'Get details of a specific task including completions',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string', description: 'Task ID' } },
      required: ['task_id']
    },
    annotations: { title: 'Get Task', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      const result = await api('GET', `/tasks/${args.task_id}`);
      return JSON.stringify(result.data, null, 2);
    }
  },
  {
    name: 'tascan_update_task',
    description: 'Update a task (title, description, response_type, flags, sort_order)',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID' },
        title: { type: 'string', description: 'New title' },
        description: { type: 'string', description: 'New description' },
        response_type: { type: 'string', enum: ['checkbox', 'photo', 'text', 'number', 'date', 'choice'], description: 'See tascan_add_tasks for guidance. "text" for info collection, "photo" for visual proof, "checkbox" for yes/no only.' },
        is_safety_checkpoint: { type: 'boolean', description: 'Safety-critical flag' },
        requires_photo: { type: 'boolean', description: 'Require photo' },
        sort_order: { type: 'number', description: 'Sort position' }
      },
      required: ['task_id']
    },
    annotations: { title: 'Update Task', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      const { task_id, ...updates } = args;
      const body = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
      const result = await api('PUT', `/tasks/${task_id}`, body);
      return `Task updated: ${result.data.title}\n\n${JSON.stringify(result.data, null, 2)}`;
    }
  },
  {
    name: 'tascan_delete_task',
    description: 'Delete a specific task and its completions. This action is irreversible.',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string', description: 'Task ID to delete' } },
      required: ['task_id']
    },
    annotations: { title: 'Delete Task', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      await api('DELETE', `/tasks/${args.task_id}`);
      return `Task ${args.task_id} deleted successfully.`;
    }
  },
  {
    name: 'tascan_complete_task',
    description: 'Complete a task on behalf of a worker. Inserts a completion record and timer event. Use this to simulate or record task completions via the API.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to complete' },
        worker_id: { type: 'string', description: 'Worker ID performing the completion' },
        notes: { type: 'string', description: 'Optional completion notes' },
        response_value: { type: 'string', description: 'Response value (for text/number/choice tasks)' }
      },
      required: ['task_id', 'worker_id']
    },
    annotations: { title: 'Complete Task', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args, api) => {
      const result = await api('POST', `/tasks/${args.task_id}/complete`, {
        worker_id: args.worker_id,
        notes: args.notes,
        response_value: args.response_value
      });
      const d = result.data;
      return `Task completed!\n  Task: ${d.task_title} (${d.task_id})\n  Worker: ${d.worker_id}\n  Completed: ${d.completed_at}`;
    }
  },
  {
    name: 'tascan_list_workers',
    description: 'List all workers (taskees) in the organization',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'List Workers', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      const result = await api('GET', '/workers');
      return JSON.stringify(result.data, null, 2);
    }
  },
  {
    name: 'tascan_create_worker',
    description: 'Create a new worker (taskee) in the organization',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Worker name' },
        phone: { type: 'string', description: 'Phone number' },
        email: { type: 'string', description: 'Email' }
      },
      required: ['name']
    },
    annotations: { title: 'Create Worker', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args, api) => {
      const result = await api('POST', '/workers', { name: args.name, phone: args.phone, email: args.email });
      return `Worker created: ${result.data.name} (ID: ${result.data.id})\n\n${JSON.stringify(result.data, null, 2)}`;
    }
  },
  {
    name: 'tascan_update_worker',
    description: 'Update a worker profile (name, phone, email)',
    inputSchema: {
      type: 'object',
      properties: {
        worker_id: { type: 'string', description: 'Worker ID' },
        name: { type: 'string', description: 'New name' },
        phone: { type: 'string', description: 'New phone' },
        email: { type: 'string', description: 'New email' }
      },
      required: ['worker_id']
    },
    annotations: { title: 'Update Worker', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      const { worker_id, ...updates } = args;
      const body = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
      const result = await api('PUT', `/workers/${worker_id}`, body);
      return `Worker updated: ${result.data.name}\n\n${JSON.stringify(result.data, null, 2)}`;
    }
  },
  {
    name: 'tascan_generate_qr',
    description: 'Generate a QR code for a task list (event) that workers can scan to access tasks',
    inputSchema: {
      type: 'object',
      properties: { list_id: { type: 'string', description: 'Task list (event) ID' } },
      required: ['list_id']
    },
    annotations: { title: 'Generate QR Code', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      const result = await api('POST', `/lists/${args.list_id}/qr`);
      return `QR Code generated for "${result.data.list_name}":\n- Scan URL: ${result.data.scan_url}\n- QR Image: ${result.data.qr_image_url}`;
    }
  },
  {
    name: 'tascan_apply_template',
    description: 'Apply a pre-built template to a task list, adding all template tasks',
    inputSchema: {
      type: 'object',
      properties: {
        list_id: { type: 'string', description: 'Task list (event) ID' },
        template_slug: { type: 'string', description: 'Template slug (e.g. "conference-load-in", "warehouse-receiving")' }
      },
      required: ['list_id', 'template_slug']
    },
    annotations: { title: 'Apply Template', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args, api) => {
      const result = await api('POST', `/lists/${args.list_id}/apply-template`, { template_slug: args.template_slug });
      return `Template applied! ${result.count} tasks added to list ${args.list_id}\n\n${JSON.stringify(result.data, null, 2)}`;
    }
  },
  {
    name: 'tascan_list_templates',
    description: 'List available task templates (built-in and saved)',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter by category (e.g. "live-events", "hospitality", "logistics")' }
      }
    },
    annotations: { title: 'List Templates', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      const path = args.category ? `/templates?category=${encodeURIComponent(args.category)}` : '/templates';
      const result = await api('GET', path);
      return JSON.stringify(result.data, null, 2);
    }
  },
  {
    name: 'tascan_get_report',
    description: 'Get completion report for a task list (event) including task status, completions, workers, and photos. Set include_responses to also return the actual submitted response data (numbers, text, choices) for each completed task.',
    inputSchema: {
      type: 'object',
      properties: {
        list_id: { type: 'string', description: 'Task list (event) ID' },
        include_responses: { type: 'boolean', description: 'Include the actual submitted response values for each completed task (default false — keeps the payload light)' }
      },
      required: ['list_id']
    },
    annotations: { title: 'Get Report', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      const path = `/lists/${args.list_id}/report` + (args.include_responses ? '?include_responses=true' : '');
      const result = await api('GET', path);
      const r = result.data;
      let text = `Report for "${r.list_name}":\nCompletion: ${r.completed_tasks}/${r.total_tasks} (${r.completion_rate}%)\n\n`;
      for (const task of r.tasks) {
        const status = task.completed ? '[x]' : '[ ]';
        text += `${status} ${task.title}`;
        if (task.completions && task.completions.length > 0) {
          text += ` (by ${task.completions.map(c => c.worker_name).join(', ')})`;
        }
        text += '\n';
        if (args.include_responses && task.responses && task.responses.length > 0) {
          for (const resp of task.responses) {
            const { value, note } = fmtResponse(resp.response_value, resp.notes);
            text += `    -> ${value != null ? value : '(no value)'}${note ? ' — ' + note : ''} (${resp.worker_name}, ${resp.completed_at})\n`;
          }
        }
      }
      return text;
    }
  },
  {
    name: 'tascan_query_responses',
    description: "Query one task's submitted responses across every list in a project — e.g. the same exercise repeated across many workout lists returns one chronological progression series instead of N report lookups. Match by task title pattern or exact task ID.",
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        task: { type: 'string', description: 'Task title pattern (case-insensitive substring) or exact task ID' },
        limit: { type: 'number', description: 'Max responses to return (default 200, max 500)' }
      },
      required: ['project_id', 'task']
    },
    annotations: { title: 'Query Task Responses Across Lists', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      let path = `/projects/${args.project_id}/responses?task=${encodeURIComponent(args.task)}`;
      if (args.limit) path += `&limit=${args.limit}`;
      const result = await api('GET', path);
      const r = result.data;
      let text = `Responses for "${r.task}" in project "${r.project_name}" (${r.matched_tasks} matching task(s), ${r.responses.length} response(s), oldest first):\n\n`;
      for (const resp of r.responses) {
        const { value, note } = fmtResponse(resp.response_value, resp.notes);
        const when = (resp.completed_at || '').slice(0, 16).replace('T', ' ');
        text += `${when} · ${resp.list_name} · ${resp.task_title}: ${value != null ? value : '(no value)'}`;
        if (note) text += ` — ${note}`;
        text += ` (${resp.worker_name})\n`;
      }
      if (r.responses.length === 0) text += '(no responses found)\n';
      return text;
    }
  },

  // ─── Closed-Loop Autonomous Operations Protocol ─────────
  {
    name: 'tascan_list_issues',
    description: 'List all issues for a task list (event). Returns open, acknowledged, and resolved issues with severity, type, and category. Use this to discover issues that need AI analysis via tascan_analyze_issue.',
    inputSchema: {
      type: 'object',
      properties: { list_id: { type: 'string', description: 'Task list (event) ID' } },
      required: ['list_id']
    },
    annotations: { title: 'List Issues', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      const result = await api('GET', `/lists/${args.list_id}/issues`);
      const issues = result.data;
      if (!issues.length) return 'No issues reported for this task list.';
      let text = `${issues.length} issue(s) found:\n\n`;
      issues.forEach((iss, i) => {
        text += `${i+1}. [${iss.status.toUpperCase()}] ${iss.title}\n`;
        text += `   ID: ${iss.id} | Type: ${iss.type} | Category: ${iss.category} | Severity: ${iss.severity || 'unset'}\n`;
        if (iss.tasks) text += `   Task: ${iss.tasks.title}\n`;
        text += `   Reported: ${iss.created_at}\n\n`;
      });
      return text;
    }
  },
  {
    name: 'tascan_analyze_issue',
    description: 'Step 1 of the Closed-Loop Autonomous Operations Protocol. Retrieves full issue context including worker info, message thread, project history, and recent similar issues. Use this data to reason about the root cause and generate a remediation plan. Also supports server-side AI analysis via POST (calls Anthropic API directly).',
    inputSchema: {
      type: 'object',
      properties: {
        issue_id: { type: 'string', description: 'Issue ID to analyze' },
        server_side_ai: { type: 'boolean', description: 'If true, the server calls Anthropic API directly for AI analysis (default: false — returns raw data for MCP client to analyze)' }
      },
      required: ['issue_id']
    },
    annotations: { title: 'Analyze Issue', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, api) => {
      // If server_side_ai, call the /analyze endpoint (Anthropic API on server)
      if (args.server_side_ai) {
        const result = await api('POST', `/issues/${args.issue_id}/analyze`);
        const d = result.data;
        let text = `=== AI ANALYSIS (Server-Side) ===\n`;
        text += `Issue: ${d.issue_title} (${d.issue_id})\n`;
        text += `Analyzed at: ${d.analyzed_at}\n\n`;
        text += JSON.stringify(d.analysis, null, 2);
        return text;
      }

      // Default: return rich context for MCP client to reason about
      const result = await api('GET', `/issues/${args.issue_id}`);
      const d = result.data;
      let text = `=== ISSUE CONTEXT FOR ANALYSIS ===\n`;
      text += `Issue: ${d.description || 'No description'}\n`;
      text += `Type: ${d.type} | Category: ${d.category} | Severity: ${d.severity || 'unset'} | Status: ${d.status}\n`;
      text += `Description: ${d.description || 'none'}\n`;
      if (d.tasks) text += `Task: ${d.tasks.title} (${d.tasks.response_type || 'checkbox'})\nTask Description: ${d.tasks.description || 'none'}\n`;
      if (d.worker) text += `Worker: ${d.worker.name} (ID: ${d.worker.id})\n`;
      if (d.project) text += `Project: ${d.project.name} | Location: ${d.project.location || 'unknown'}\n`;
      if (d.injury_data) text += `Injury Data: ${JSON.stringify(d.injury_data)}\n`;
      text += `Reported: ${d.created_at}\n`;
      if (d.ai_analysis) text += `\n--- PREVIOUS AI ANALYSIS ---\n${JSON.stringify(d.ai_analysis, null, 2)}\n`;
      if (d.messages && d.messages.length) {
        text += `\n--- Message Thread (${d.messages.length}) ---\n`;
        d.messages.forEach(m => {
          text += `[${m.sender_type}/${m.sender_name}] ${m.message}\n`;
        });
      }
      if (d.recent_issues && d.recent_issues.length) {
        text += `\n--- Recent Issues on Same Project (${d.recent_issues.length}) ---\n`;
        d.recent_issues.forEach(ri => {
          text += `- [${ri.severity}/${ri.category}] ${(ri.description || '').substring(0, 80)} (${ri.status})\n`;
        });
      }
      return text;
    }
  },
  {
    name: 'tascan_recommend_fix',
    description: 'Step 2 of the Closed-Loop Autonomous Operations Protocol. Post an AI-generated recommendation to an issue thread. Accepts both a text recommendation and an optional structured_recommendation object with task definitions for auto-dispatch. The recommendation is persisted in the AI audit trail.',
    inputSchema: {
      type: 'object',
      properties: {
        issue_id: { type: 'string', description: 'Issue ID to recommend a fix for' },
        recommendation: { type: 'string', description: 'The AI-generated recommendation text (clear, actionable instructions)' },
        structured_recommendation: {
          type: 'object',
          description: 'Optional structured recommendation with tasks for auto-dispatch. Format: { recommendation_summary, confidence_score, tasks: [{ title, description, response_type, requires_photo, is_safety_checkpoint, sort_order }], estimated_duration_minutes, required_responder_role }'
        },
        ai_agent: { type: 'string', description: 'Name of the AI agent posting (default: TaScan AI)' }
      },
      required: ['issue_id', 'recommendation']
    },
    annotations: { title: 'Recommend Fix', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args, api) => {
      const result = await api('POST', `/issues/${args.issue_id}/recommend`, {
        recommendation: args.recommendation,
        structured_recommendation: args.structured_recommendation,
        ai_agent: args.ai_agent
      });
      const d = result.data;
      let text = `Recommendation posted to issue "${d.issue_title}":\n`;
      text += `Project: ${d.project_name} | List: ${d.list_name}\n`;
      text += `Type: ${d.issue_type} | Category: ${d.issue_category}\n`;
      text += `Message ID: ${d.message_id}\n\n`;
      text += `Recommendation:\n${d.recommendation}`;
      if (d.structured_recommendation?.tasks) {
        text += `\n\nStructured Tasks (${d.structured_recommendation.tasks.length}):`;
        d.structured_recommendation.tasks.forEach((t, i) => {
          text += `\n  ${i+1}. ${t.title}`;
        });
      }
      return text;
    }
  },
  {
    name: 'tascan_dispatch_instruction',
    description: 'Step 3 of the Closed-Loop Autonomous Operations Protocol. Dispatches remediation to the worker via MULTI-CHANNEL delivery: (1) issue thread message, (2) in-app notification, (3) progress feed update, (4) SMS if phone on file, (5) optional remediation task list creation. Closes the loop from digital AI analysis to physical worker execution.',
    inputSchema: {
      type: 'object',
      properties: {
        issue_id: { type: 'string', description: 'Issue ID this instruction relates to' },
        instruction: { type: 'string', description: 'Clear, actionable instruction for the worker to execute' },
        worker_id: { type: 'string', description: 'Target worker ID (defaults to the worker who reported the issue)' },
        remediation_tasks: {
          type: 'array',
          description: 'Optional array of tasks to create as a remediation task list. Each: { title, description, response_type, requires_photo, is_safety_checkpoint, sort_order }',
          items: { type: 'object' }
        },
        recommendation_summary: { type: 'string', description: 'One-line summary for the task list description' },
        send_sms: { type: 'boolean', description: 'Send SMS to worker (default: true if phone on file)' },
        ai_agent: { type: 'string', description: 'Name of the AI agent dispatching (default: TaScan AI)' }
      },
      required: ['issue_id', 'instruction']
    },
    annotations: { title: 'Dispatch Instruction', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (args, api) => {
      const result = await api('POST', `/issues/${args.issue_id}/dispatch`, {
        instruction: args.instruction,
        worker_id: args.worker_id,
        remediation_tasks: args.remediation_tasks,
        recommendation_summary: args.recommendation_summary,
        send_sms: args.send_sms,
        ai_agent: args.ai_agent
      });
      const d = result.data;
      let text = `Instruction dispatched via ${d.channels.length} channels: ${d.channels.join(', ')}\n`;
      text += `Worker: ${d.worker_id}\n`;
      text += `Issue: ${d.issue_id} (status: ${d.issue_status})\n`;
      text += `SMS: ${d.sms_status}\n`;
      if (d.remediation_task_list_id) {
        text += `\nRemediation Task List Created: ${d.remediation_task_list_id}\n`;
        text += `Worker URL: ${d.worker_url}\n`;
        text += `Tasks: ${d.tasks_created}\n`;
      }
      text += `\nInstruction:\n${d.instruction}`;
      return text;
    }
  },
  {
    name: 'tascan_auto_resolve',
    description: 'FULL Closed-Loop Autonomous Operations Protocol in one call. Server-side AI analyzes the issue, generates remediation tasks, creates a task list, and dispatches to the worker — all without human intervention. This executes Patent Claim 7: autonomous operations from issue detection through physical-world instruction delivery.',
    inputSchema: {
      type: 'object',
      properties: {
        issue_id: { type: 'string', description: 'Issue ID to auto-resolve' }
      },
      required: ['issue_id']
    },
    annotations: { title: 'Auto-Resolve Issue', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (args, api) => {
      const result = await api('POST', `/issues/${args.issue_id}/auto-resolve`);
      const d = result.data;
      let text = `=== CLOSED-LOOP AUTONOMOUS OPERATIONS PROTOCOL ===\n`;
      text += `Issue: ${d.issue_id}\n\n`;
      text += `--- ANALYSIS ---\n`;
      text += `Summary: ${d.analysis?.summary || 'N/A'}\n`;
      text += `Classification: ${d.analysis?.classification?.type || 'N/A'} (${d.analysis?.classification?.severity || 'N/A'})\n`;
      text += `Urgency: ${d.analysis?.urgency_score || 'N/A'}/10\n`;
      if (d.analysis?.root_cause_hypotheses?.length) {
        text += `Root Causes:\n`;
        d.analysis.root_cause_hypotheses.forEach((h, i) => {
          text += `  ${i+1}. ${h.hypothesis} (${Math.round(h.confidence * 100)}%)\n`;
        });
      }
      text += `\n--- RECOMMENDATION ---\n`;
      text += `Fix: ${d.recommendation?.recommendation_summary || 'N/A'}\n`;
      text += `Tasks: ${d.recommendation?.tasks?.length || 0}\n`;
      text += `Est. Duration: ${d.recommendation?.estimated_duration_minutes || 'N/A'} min\n`;
      text += `\n--- DISPATCH ---\n`;
      text += `Channels: ${d.dispatch?.channels?.join(', ') || 'none'}\n`;
      text += `SMS: ${d.dispatch?.sms_status || 'N/A'}\n`;
      if (d.dispatch?.worker_url) text += `Worker URL: ${d.dispatch.worker_url}\n`;
      if (d.dispatch?.remediation_task_list_id) text += `Task List ID: ${d.dispatch.remediation_task_list_id}\n`;
      text += `\n--- TIMESTAMPS ---\n`;
      text += `Analyzed: ${d.timestamps?.analyzed_at}\n`;
      text += `Recommended: ${d.timestamps?.recommended_at}\n`;
      text += `Dispatched: ${d.timestamps?.dispatched_at}\n`;
      return text;
    }
  },

  // ─── SendGrid Email Tool ──────────────────────────────────
  {
    name: 'tascan_send_task_email',
    description: 'Send a branded TaScan task notification email via SendGrid. Can notify anyone about a specific task list or task. Includes QR code, task summary, and "Open in TaScan" button.',
    inputSchema: {
      type: 'object',
      properties: {
        to_email: { type: 'string', description: 'Recipient email address' },
        to_name: { type: 'string', description: 'Recipient display name' },
        list_id: { type: 'string', description: 'Task list (event) ID' },
        task_id: { type: 'string', description: 'Optional specific task ID to highlight' },
        subject: { type: 'string', description: 'Custom email subject (defaults to auto-generated)' },
        message: { type: 'string', description: 'Optional custom message to include in the email body' },
        include_qr: { type: 'boolean', description: 'Include QR code for the task list in the email (default: true)' }
      },
      required: ['to_email', 'list_id']
    },
    annotations: { title: 'Send Task Email', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (args) => {
      // Call the send-task-email function directly via HTTP
      const url = 'https://app.tascan.io/.netlify/functions/send-task-email';
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_email: args.to_email,
          to_name: args.to_name,
          list_id: args.list_id,
          task_id: args.task_id,
          subject: args.subject,
          message: args.message,
          include_qr: args.include_qr !== false
        })
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        throw new Error(data.error || `Email send failed (${resp.status})`);
      }
      return `Email sent successfully!\n  To: ${args.to_email}\n  Subject: ${data.subject}\n  Message ID: ${data.message_id || 'N/A'}`;
    }
  },

  // ─── NFC Tag Registry (ported from the stdio server) ─────
  {
    name: 'tascan_register_tag',
    description: 'Register a physical NFC tag to a project, task list, or specific task. When someone taps the tag, TaScan routes them to the linked resource. Tags use NTAG215 chips and are programmed with NFC Tools Pro.',
    inputSchema: {
      type: 'object',
      properties: {
        tag_hardware_id: { type: 'string', description: 'NFC tag hardware serial number (e.g., "04:CB:6C:51:CE:2A:81")' },
        tag_name: { type: 'string', description: 'Friendly name (e.g., "Ballroom A Door", "Breaker Panel 3")' },
        target_type: { type: 'string', enum: ['project', 'task_list', 'task'], description: 'What this tag points to' },
        project_id: { type: 'string', description: 'Project ID' },
        task_list_id: { type: 'string', description: 'Task list ID (required for task_list/task targets)' },
        task_id: { type: 'string', description: 'Task ID (required for task targets)' },
        location_description: { type: 'string', description: 'Physical location of the tag' }
      },
      required: ['tag_hardware_id', 'tag_name', 'target_type']
    },
    annotations: { title: 'Register NFC Tag', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args, api) => {
      const result = await api('POST', '/tags', {
        tag_hardware_id: args.tag_hardware_id, tag_name: args.tag_name, target_type: args.target_type,
        project_id: args.project_id, task_list_id: args.task_list_id, task_id: args.task_id,
        location_description: args.location_description
      });
      const d = result.data;
      const nfcUrl = 'https://app.tascan.io/scan?tag={TAG-ID}&time={DATETIME}';
      return `Tag registered: "${d.tag_name}" (${d.tag_hardware_id})\nTarget: ${d.target_type}\nID: ${d.id}\n\nProgram the NFC tag with this URL:\n${nfcUrl}\n\n${JSON.stringify(d, null, 2)}`;
    }
  },
  {
    name: 'tascan_list_tags',
    description: 'List all registered NFC tags in the organization with their linked projects/task lists and scan counts',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'List NFC Tags', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      const result = await api('GET', '/tags');
      const tags = result.data;
      if (!tags.length) return 'No NFC tags registered.';
      let text = `${tags.length} tag(s) registered:\n\n`;
      tags.forEach((t, i) => {
        text += `${i + 1}. "${t.tag_name}" — ${t.tag_hardware_id}\n`;
        text += `   Target: ${t.target_type} | Scans: ${t.scan_count} | Active: ${t.is_active}\n`;
        if (t.projects) text += `   Project: ${t.projects.name}\n`;
        if (t.task_lists) text += `   Task List: ${t.task_lists.name}\n`;
        if (t.location_description) text += `   Location: ${t.location_description}\n`;
        text += '\n';
      });
      return text;
    }
  },
  {
    name: 'tascan_get_scan_history',
    description: 'Get scan event history for a registered NFC tag — timestamps, GPS coordinates, and accuracy for each scan',
    inputSchema: {
      type: 'object',
      properties: {
        tag_id: { type: 'string', description: 'Tag registry ID (from tascan_list_tags)' },
        limit: { type: 'number', description: 'Max results (default 50)' }
      },
      required: ['tag_id']
    },
    annotations: { title: 'Get Scan History', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args, api) => {
      const path = `/tags/${args.tag_id}/scans` + (args.limit ? `?limit=${args.limit}` : '');
      const result = await api('GET', path);
      const scans = result.data;
      if (!scans.length) return 'No scans recorded for this tag.';
      let text = `${scans.length} scan(s):\n\n`;
      scans.forEach((s, i) => {
        text += `${i + 1}. ${s.scanned_at}`;
        if (s.gps_lat && s.gps_lng) text += ` — GPS: ${s.gps_lat.toFixed(6)}, ${s.gps_lng.toFixed(6)} (±${Math.round(s.gps_accuracy || 0)}m)`;
        text += '\n';
      });
      return text;
    }
  }
];

module.exports = { TOOLS, AGENT_REGISTRY, dynamicAgents };
