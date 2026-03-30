'use strict';

const taskRouter = require('../../taskRouter');

function parsePriority(priority) {
  const value = String(priority || '').toLowerCase();
  if (value === 'high' || value === 'p1') return 'P1';
  if (value === 'medium' || value === 'p2') return 'P2';
  if (value === 'low' || value === 'p3') return 'P3';
  return 'P2';
}

class ProjectManagementAdapter {
  async execute(context) {
    const { workspaceId, params = {}, agentId } = context;
    const action = params.action || 'list';

    switch (action) {
      case 'create':
        return this._createTask(workspaceId, params, agentId);
      case 'update':
        return this._updateTask(workspaceId, params);
      case 'list':
        return this._listTasks(workspaceId, params);
      case 'close':
        return this._closeTask(workspaceId, params);
      default:
        return { success: false, error: `Unknown project management action: "${action}"` };
    }
  }

  async _createTask(workspaceId, params, agentId) {
    const task = params.task || params;
    if (!task.title && !params.title) {
      return { success: false, error: 'task.title is required' };
    }

    const created = await taskRouter.createTask({
      title: task.title || params.title,
      description: task.description || params.description || '',
      priority: parsePriority(task.priority || params.priority),
      due_date: task.due_date || params.due_date || null,
      assigned_agent: task.assigned_agent || params.assigned_agent || null,
      created_by: agentId || null,
      workspace_id: workspaceId,
      source: 'skill_project_management',
      metadata: {
        via_skill: true,
        skill_action: 'create',
        requested_by_agent: agentId || null,
      },
    });

    return {
      success: true,
      data: {
        id: created.id,
        title: created.title,
        status: created.status,
        assigned_agent: created.assigned_agent,
        priority: created.priority,
      },
    };
  }

  async _updateTask(workspaceId, params) {
    const taskId = params.task_id || params.id || params.task?.id;
    if (!taskId) return { success: false, error: 'task_id is required for update' };

    const updates = params.task || params.updates || {};
    const updated = await taskRouter.updateTask(taskId, updates, workspaceId);
    if (!updated) return { success: false, error: 'Task not found' };

    return {
      success: true,
      data: {
        id: updated.id,
        title: updated.title,
        status: updated.status,
        assigned_agent: updated.assigned_agent,
        priority: updated.priority,
      },
    };
  }

  async _listTasks(workspaceId, params) {
    const tasks = await taskRouter.listTasks({
      workspace_id: workspaceId,
      status: params.status || null,
      assigned_agent: params.assigned_agent || null,
    });

    return {
      success: true,
      data: {
        tasks: tasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          assigned_agent: task.assigned_agent,
          priority: task.priority,
          due_date: task.due_date,
        })),
      },
    };
  }

  async _closeTask(workspaceId, params) {
    const taskId = params.task_id || params.id || params.task?.id;
    if (!taskId) return { success: false, error: 'task_id is required for close' };

    const updated = await taskRouter.updateTask(taskId, { status: 'done' }, workspaceId);
    if (!updated) return { success: false, error: 'Task not found' };

    return {
      success: true,
      data: {
        id: updated.id,
        title: updated.title,
        status: updated.status,
      },
    };
  }
}

module.exports = { ProjectManagementAdapter };
