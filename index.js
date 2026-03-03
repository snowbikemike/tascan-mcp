#!/usr/bin/env node

// ============================================================
// TaScan MCP Server
// Wraps TaScan REST API v1 for Claude and other AI agents
// Transport: stdio (for Claude Desktop / Claude Code)
// ============================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE = process.env.TASCAN_API_URL || 'https://tascan-live-event.netlify.app/api/v1';
const API_KEY = process.env.TASCAN_API_KEY || '';

if (!API_KEY) {
  console.error('TASCAN_API_KEY environment variable is required');
  process.exit(1);
}

// ─── API Helper ────────────────────────────────────────────
async function apiCall(method, path, body) {
  const url = API_BASE + path;
  const opts = {
    method,
    headers: {
      'Authorization': 'Bearer ' + API_KEY,
      'Content-Type': 'application/json'
    }
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    opts.body = JSON.stringify(body);
  }

  const resp = await fetch(url, opts);
  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(data.error || `API error ${resp.status}`);
  }

  return data;
}

// ─── Server Setup ──────────────────────────────────────────
const server = new McpServer({
  name: 'tascan',
  version: '1.0.0'
});


// ─── Tool: List Projects ───────────────────────────────────
server.registerTool(
  'tascan_list_projects',
  {
    title: 'List Projects',
    description: 'List all TaScan projects in the organization',
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false
    }
  },
  async () => {
    const result = await apiCall('GET', '/projects');
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result.data, null, 2)
      }]
    };
  }
);


// ─── Tool: Create Project ──────────────────────────────────
server.registerTool(
  'tascan_create_project',
  {
    title: 'Create Project',
    description: 'Create a new TaScan project (top-level container for events)',
    inputSchema: {
      name: z.string().describe('Project name'),
      location: z.string().optional().describe('Project location / venue')
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false
    }
  },
  async ({ name, location }) => {
    const result = await apiCall('POST', '/projects', { name, location });
    return {
      content: [{
        type: 'text',
        text: `Project created: ${result.data.name} (ID: ${result.data.id})\n\n${JSON.stringify(result.data, null, 2)}`
      }]
    };
  }
);


// ─── Tool: Create Event (Task List) ────────────────────────
server.registerTool(
  'tascan_create_event',
  {
    title: 'Create Event',
    description: 'Create a new event (task list) within a project',
    inputSchema: {
      project_id: z.string().describe('Project ID to add the event to'),
      name: z.string().describe('Event name'),
      description: z.string().optional().describe('Event description')
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false
    }
  },
  async ({ project_id, name, description }) => {
    const result = await apiCall('POST', `/projects/${project_id}/lists`, { name, description });
    return {
      content: [{
        type: 'text',
        text: `Event created: ${result.data.name} (ID: ${result.data.id})\n\n${JSON.stringify(result.data, null, 2)}`
      }]
    };
  }
);


// ─── Tool: Add Tasks (Bulk) ────────────────────────────────
server.registerTool(
  'tascan_add_tasks',
  {
    title: 'Add Tasks',
    description: 'Add one or more tasks to an event (task list). Supports bulk creation.',
    inputSchema: {
      list_id: z.string().describe('Task list (event) ID'),
      tasks: z.array(z.object({
        title: z.string().describe('Task title'),
        description: z.string().optional().describe('Task description'),
        response_type: z.enum(['checkbox', 'photo', 'text', 'number', 'date', 'choice']).optional().describe('Task type (default: checkbox)'),
        is_safety_checkpoint: z.boolean().optional().describe('Safety-critical task flag'),
        requires_photo: z.boolean().optional().describe('Require photo on completion')
      })).describe('Array of tasks to create')
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false
    }
  },
  async ({ list_id, tasks }) => {
    const result = await apiCall('POST', `/lists/${list_id}/tasks`, tasks);
    return {
      content: [{
        type: 'text',
        text: `${result.count} task(s) created in list ${list_id}\n\n${JSON.stringify(result.data, null, 2)}`
      }]
    };
  }
);


// ─── Tool: List Workers ────────────────────────────────────
server.registerTool(
  'tascan_list_workers',
  {
    title: 'List Workers',
    description: 'List all workers (taskees) in the organization',
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false
    }
  },
  async () => {
    const result = await apiCall('GET', '/workers');
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result.data, null, 2)
      }]
    };
  }
);


// ─── Tool: Create Worker ───────────────────────────────────
server.registerTool(
  'tascan_create_worker',
  {
    title: 'Create Worker',
    description: 'Create a new worker (taskee) in the organization',
    inputSchema: {
      name: z.string().describe('Worker name'),
      phone: z.string().optional().describe('Worker phone number'),
      email: z.string().optional().describe('Worker email')
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false
    }
  },
  async ({ name, phone, email }) => {
    const result = await apiCall('POST', '/workers', { name, phone, email });
    return {
      content: [{
        type: 'text',
        text: `Worker created: ${result.data.name} (ID: ${result.data.id})\n\n${JSON.stringify(result.data, null, 2)}`
      }]
    };
  }
);


// ─── Tool: Generate QR Code ────────────────────────────────
server.registerTool(
  'tascan_generate_qr',
  {
    title: 'Generate QR Code',
    description: 'Generate a QR code for a task list (event) that workers can scan to access tasks',
    inputSchema: {
      list_id: z.string().describe('Task list (event) ID')
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false
    }
  },
  async ({ list_id }) => {
    const result = await apiCall('POST', `/lists/${list_id}/qr`);
    return {
      content: [{
        type: 'text',
        text: `QR Code generated for "${result.data.list_name}":\n- Scan URL: ${result.data.scan_url}\n- QR Image: ${result.data.qr_image_url}`
      }]
    };
  }
);


// ─── Tool: Apply Template ──────────────────────────────────
server.registerTool(
  'tascan_apply_template',
  {
    title: 'Apply Template',
    description: 'Apply a pre-built template to a task list, adding all template tasks',
    inputSchema: {
      list_id: z.string().describe('Task list (event) ID to apply template to'),
      template_slug: z.string().describe('Template slug (e.g. "conference-load-in", "warehouse-receiving", "restaurant-opening", "hotel-room-turnover")')
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false
    }
  },
  async ({ list_id, template_slug }) => {
    const result = await apiCall('POST', `/lists/${list_id}/apply-template`, { template_slug });
    return {
      content: [{
        type: 'text',
        text: `Template applied! ${result.count} tasks added to list ${list_id}\n\n${JSON.stringify(result.data, null, 2)}`
      }]
    };
  }
);


// ─── Tool: Get Report ──────────────────────────────────────
server.registerTool(
  'tascan_get_report',
  {
    title: 'Get Completion Report',
    description: 'Get completion report for a task list (event) including task status, completions, workers, and photos',
    inputSchema: {
      list_id: z.string().describe('Task list (event) ID')
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false
    }
  },
  async ({ list_id }) => {
    const result = await apiCall('GET', `/lists/${list_id}/report`);
    const r = result.data;
    let text = `Report for "${r.list_name}":\n`;
    text += `Completion: ${r.completed_tasks}/${r.total_tasks} (${r.completion_rate}%)\n\n`;

    for (const task of r.tasks) {
      const status = task.completed ? '[x]' : '[ ]';
      text += `${status} ${task.title}`;
      if (task.completions && task.completions.length > 0) {
        text += ` (by ${task.completions.map(c => c.worker_name).join(', ')})`;
      }
      text += '\n';
    }

    return { content: [{ type: 'text', text }] };
  }
);


// ─── Tool: List Templates ──────────────────────────────────
server.registerTool(
  'tascan_list_templates',
  {
    title: 'List Templates',
    description: 'List available task templates (built-in and saved)',
    inputSchema: {
      category: z.string().optional().describe('Filter by category (e.g. "live-events", "hospitality", "logistics", "construction", "facilities", "general", "field-service", "education")')
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false
    }
  },
  async ({ category }) => {
    const path = category ? `/templates?category=${encodeURIComponent(category)}` : '/templates';
    const result = await apiCall('GET', path);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result.data, null, 2)
      }]
    };
  }
);


// ─── Tool: List Events (Task Lists) ──────────────────────
server.registerTool(
  'tascan_list_events',
  {
    title: 'List Events',
    description: 'List all events (task lists) within a project',
    inputSchema: {
      project_id: z.string().describe('Project ID')
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false
    }
  },
  async ({ project_id }) => {
    const result = await apiCall('GET', `/projects/${project_id}/lists`);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result.data, null, 2)
      }]
    };
  }
);


// ─── Tool: Get Event ─────────────────────────────────────
server.registerTool(
  'tascan_get_event',
  {
    title: 'Get Event',
    description: 'Get details of a specific event (task list) including its tasks',
    inputSchema: {
      list_id: z.string().describe('Task list (event) ID')
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false
    }
  },
  async ({ list_id }) => {
    const result = await apiCall('GET', `/lists/${list_id}`);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result.data, null, 2)
      }]
    };
  }
);


// ─── Tool: List Tasks ────────────────────────────────────
server.registerTool(
  'tascan_list_tasks',
  {
    title: 'List Tasks',
    description: 'List all tasks in an event (task list)',
    inputSchema: {
      list_id: z.string().describe('Task list (event) ID')
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false
    }
  },
  async ({ list_id }) => {
    const result = await apiCall('GET', `/lists/${list_id}/tasks`);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result.data, null, 2)
      }]
    };
  }
);


// ─── Tool: Get Project ───────────────────────────────────
server.registerTool(
  'tascan_get_project',
  {
    title: 'Get Project',
    description: 'Get details of a specific project',
    inputSchema: {
      project_id: z.string().describe('Project ID')
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false
    }
  },
  async ({ project_id }) => {
    const result = await apiCall('GET', `/projects/${project_id}`);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result.data, null, 2)
      }]
    };
  }
);


// ─── Tool: Get Task ──────────────────────────────────────
server.registerTool(
  'tascan_get_task',
  {
    title: 'Get Task',
    description: 'Get details of a specific task including completions',
    inputSchema: {
      task_id: z.string().describe('Task ID')
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false
    }
  },
  async ({ task_id }) => {
    const result = await apiCall('GET', `/tasks/${task_id}`);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result.data, null, 2)
      }]
    };
  }
);


// ─── Tool: Update Project ────────────────────────────────
server.registerTool(
  'tascan_update_project',
  {
    title: 'Update Project',
    description: 'Update a project (name, location, status, dates)',
    inputSchema: {
      project_id: z.string().describe('Project ID'),
      name: z.string().optional().describe('New project name'),
      location: z.string().optional().describe('New location'),
      status: z.enum(['active', 'archived']).optional().describe('Project status'),
      start_date: z.string().optional().describe('Start date (ISO format)'),
      end_date: z.string().optional().describe('End date (ISO format)')
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false
    }
  },
  async ({ project_id, ...updates }) => {
    const body = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    const result = await apiCall('PUT', `/projects/${project_id}`, body);
    return {
      content: [{
        type: 'text',
        text: `Project updated: ${result.data.name}\n\n${JSON.stringify(result.data, null, 2)}`
      }]
    };
  }
);


// ─── Tool: Update Event ──────────────────────────────────
server.registerTool(
  'tascan_update_event',
  {
    title: 'Update Event',
    description: 'Update an event / task list (name, description, team_mode, timer_mode)',
    inputSchema: {
      list_id: z.string().describe('Task list (event) ID'),
      name: z.string().optional().describe('New event name'),
      description: z.string().optional().describe('New description'),
      team_mode: z.boolean().optional().describe('Team mode on/off'),
      timer_mode: z.boolean().optional().describe('Timer mode on/off')
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false
    }
  },
  async ({ list_id, ...updates }) => {
    const body = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    const result = await apiCall('PUT', `/lists/${list_id}`, body);
    return {
      content: [{
        type: 'text',
        text: `Event updated: ${result.data.name}\n\n${JSON.stringify(result.data, null, 2)}`
      }]
    };
  }
);


// ─── Tool: Update Task ───────────────────────────────────
server.registerTool(
  'tascan_update_task',
  {
    title: 'Update Task',
    description: 'Update a task (title, description, response_type, flags, sort_order)',
    inputSchema: {
      task_id: z.string().describe('Task ID'),
      title: z.string().optional().describe('New title'),
      description: z.string().optional().describe('New description'),
      response_type: z.enum(['checkbox', 'photo', 'text', 'number', 'date', 'choice']).optional().describe('Task type'),
      is_safety_checkpoint: z.boolean().optional().describe('Safety-critical flag'),
      requires_photo: z.boolean().optional().describe('Require photo'),
      sort_order: z.number().optional().describe('Sort order position')
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false
    }
  },
  async ({ task_id, ...updates }) => {
    const body = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    const result = await apiCall('PUT', `/tasks/${task_id}`, body);
    return {
      content: [{
        type: 'text',
        text: `Task updated: ${result.data.title}\n\n${JSON.stringify(result.data, null, 2)}`
      }]
    };
  }
);


// ─── Tool: Delete Project ────────────────────────────────
server.registerTool(
  'tascan_delete_project',
  {
    title: 'Delete Project',
    description: 'Delete a project and all its events, tasks, and completions',
    inputSchema: {
      project_id: z.string().describe('Project ID to delete')
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true
    }
  },
  async ({ project_id }) => {
    await apiCall('DELETE', `/projects/${project_id}`);
    return {
      content: [{
        type: 'text',
        text: `Project ${project_id} deleted successfully.`
      }]
    };
  }
);


// ─── Tool: Delete Event ──────────────────────────────────
server.registerTool(
  'tascan_delete_event',
  {
    title: 'Delete Event',
    description: 'Delete an event (task list) and all its tasks and completions',
    inputSchema: {
      list_id: z.string().describe('Task list (event) ID to delete')
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true
    }
  },
  async ({ list_id }) => {
    await apiCall('DELETE', `/lists/${list_id}`);
    return {
      content: [{
        type: 'text',
        text: `Event ${list_id} deleted successfully.`
      }]
    };
  }
);


// ─── Tool: Delete Task ───────────────────────────────────
server.registerTool(
  'tascan_delete_task',
  {
    title: 'Delete Task',
    description: 'Delete a specific task and its completions',
    inputSchema: {
      task_id: z.string().describe('Task ID to delete')
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true
    }
  },
  async ({ task_id }) => {
    await apiCall('DELETE', `/tasks/${task_id}`);
    return {
      content: [{
        type: 'text',
        text: `Task ${task_id} deleted successfully.`
      }]
    };
  }
);


// ─── Tool: Update Worker ─────────────────────────────────
server.registerTool(
  'tascan_update_worker',
  {
    title: 'Update Worker',
    description: 'Update a worker profile (name, phone, email)',
    inputSchema: {
      worker_id: z.string().describe('Worker ID'),
      name: z.string().optional().describe('New name'),
      phone: z.string().optional().describe('New phone number'),
      email: z.string().optional().describe('New email')
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false
    }
  },
  async ({ worker_id, ...updates }) => {
    const body = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    const result = await apiCall('PUT', `/workers/${worker_id}`, body);
    return {
      content: [{
        type: 'text',
        text: `Worker updated: ${result.data.name}\n\n${JSON.stringify(result.data, null, 2)}`
      }]
    };
  }
);


// ─── Start Server ──────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  console.error('TaScan MCP server error:', err);
  process.exit(1);
});
