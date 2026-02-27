'use client';

import React, { useState, useEffect } from 'react';

// ============================================================================
// TASKS PAGE — Sprint 16
// ============================================================================
// Full-featured Kanban + List view for Vutler Tasks
// Colors: Navy #1a1a2e, Electric Blue #0066ff, White cards
// Font: Inter
// ============================================================================

const TasksPage = () => {
  // ========== STATE ==========
  const [tasks, setTasks] = useState([]);
  const [agents, setAgents] = useState([]);
  const [view, setView] = useState('kanban'); // 'kanban' | 'list'
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    assignee: '',
    search: ''
  });
  const [sortColumn, setSortColumn] = useState('created_at');
  const [sortDirection, setSortDirection] = useState('desc');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [draggedTask, setDraggedTask] = useState(null);
  const [detailTab, setDetailTab] = useState('info'); // 'info' | 'comments' | 'activity'
  const [comments, setComments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);

  // Form state for create/edit modal
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    assignee_id: '',
    assignee_type: 'agent',
    due_date: ''
  });

  const statuses = ['todo', 'in_progress', 'review', 'done'];
  const priorities = ['low', 'medium', 'high', 'urgent'];

  // ========== API CALLS ==========
  const API_BASE = '/api/v1/tasks';

  const fetchTasks = async () => {
    try {
      const response = await fetch(API_BASE, {
        headers: {
          'X-Auth-Token': localStorage.getItem('rc_token'),
          'X-User-Id': localStorage.getItem('rc_uid')
        }
      });
      const data = await response.json();
      setTasks(data);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      const response = await fetch('/api/v1/agents', {
        headers: {
          'X-Auth-Token': localStorage.getItem('rc_token'),
          'X-User-Id': localStorage.getItem('rc_uid')
        }
      });
      const data = await response.json();
      setAgents(data);
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  const createTask = async () => {
    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': localStorage.getItem('rc_token'),
          'X-User-Id': localStorage.getItem('rc_uid')
        },
        body: JSON.stringify(formData)
      });
      const newTask = await response.json();
      setTasks([...tasks, newTask]);
      setShowCreateModal(false);
      resetForm();
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  const updateTask = async (taskId, updates) => {
    try {
      const response = await fetch(`${API_BASE}/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': localStorage.getItem('rc_token'),
          'X-User-Id': localStorage.getItem('rc_uid')
        },
        body: JSON.stringify(updates)
      });
      const updatedTask = await response.json();
      setTasks(tasks.map(t => t.id === taskId ? updatedTask : t));
      if (selectedTask?.id === taskId) {
        setSelectedTask(updatedTask);
      }
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const deleteTask = async (taskId) => {
    if (!confirm('Delete this task?')) return;
    try {
      await fetch(`${API_BASE}/${taskId}`, {
        method: 'DELETE',
        headers: {
          'X-Auth-Token': localStorage.getItem('rc_token'),
          'X-User-Id': localStorage.getItem('rc_uid')
        }
      });
      setTasks(tasks.filter(t => t.id !== taskId));
      setShowDetailModal(false);
      setShowCreateModal(false);
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const moveTask = async (taskId, newStatus) => {
    try {
      await fetch(`${API_BASE}/${taskId}/move`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': localStorage.getItem('rc_token'),
          'X-User-Id': localStorage.getItem('rc_uid')
        },
        body: JSON.stringify({ status: newStatus })
      });
      fetchTasks(); // Refresh
    } catch (error) {
      console.error('Error moving task:', error);
    }
  };

  const fetchComments = async (taskId) => {
    try {
      const response = await fetch(`${API_BASE}/${taskId}/comments`, {
        headers: {
          'X-Auth-Token': localStorage.getItem('rc_token'),
          'X-User-Id': localStorage.getItem('rc_uid')
        }
      });
      const data = await response.json();
      setComments(data);
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

  const addComment = async (taskId) => {
    if (!newComment.trim()) return;
    try {
      const response = await fetch(`${API_BASE}/${taskId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': localStorage.getItem('rc_token'),
          'X-User-Id': localStorage.getItem('rc_uid')
        },
        body: JSON.stringify({ body: newComment })
      });
      const comment = await response.json();
      setComments([...comments, comment]);
      setNewComment('');
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  const fetchActivity = async (taskId) => {
    try {
      const response = await fetch(`${API_BASE}/${taskId}/activity`, {
        headers: {
          'X-Auth-Token': localStorage.getItem('rc_token'),
          'X-User-Id': localStorage.getItem('rc_uid')
        }
      });
      const data = await response.json();
      setActivity(data);
    } catch (error) {
      console.error('Error fetching activity:', error);
    }
  };

  useEffect(() => {
    fetchTasks();
    fetchAgents();
  }, []);

  useEffect(() => {
    if (selectedTask) {
      fetchComments(selectedTask.id);
      fetchActivity(selectedTask.id);
    }
  }, [selectedTask]);

  // ========== FILTERS ==========
  const filteredTasks = tasks.filter(task => {
    if (filters.status && task.status !== filters.status) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.assignee && task.assignee_id !== filters.assignee) return false;
    if (filters.search && !task.title.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  });

  // ========== SORTING (for List View) ==========
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const aVal = a[sortColumn];
    const bVal = b[sortColumn];
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // ========== DRAG & DROP ==========
  const handleDragStart = (e, task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, newStatus) => {
    e.preventDefault();
    if (draggedTask && draggedTask.status !== newStatus) {
      moveTask(draggedTask.id, newStatus);
    }
    setDraggedTask(null);
  };

  // ========== HELPERS ==========
  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      status: 'todo',
      priority: 'medium',
      assignee_id: '',
      assignee_type: 'agent',
      due_date: ''
    });
  };

  const openEditModal = (task) => {
    setSelectedTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      assignee_id: task.assignee_id || '',
      assignee_type: task.assignee_type || 'agent',
      due_date: task.due_date ? task.due_date.split('T')[0] : ''
    });
    setShowCreateModal(true);
  };

  const saveTask = () => {
    if (selectedTask) {
      updateTask(selectedTask.id, formData);
      setShowCreateModal(false);
      setSelectedTask(null);
      resetForm();
    } else {
      createTask();
    }
  };

  const openDetailModal = (task) => {
    setSelectedTask(task);
    setDetailTab('info');
    setShowDetailModal(true);
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return '#ef4444';
      case 'high': return '#f97316';
      case 'medium': return '#0066ff';
      case 'low': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const getStatusLabel = (status) => {
    return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // ========== RENDER ==========
  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>Loading tasks...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* TOOLBAR */}
      <div style={styles.toolbar}>
        <h1 style={styles.title}>Tasks</h1>
        
        {/* View Toggle */}
        <div style={styles.viewToggle}>
          <button
            style={{...styles.toggleBtn, ...(view === 'kanban' ? styles.toggleBtnActive : {})}}
            onClick={() => setView('kanban')}
          >
            📋 Kanban
          </button>
          <button
            style={{...styles.toggleBtn, ...(view === 'list' ? styles.toggleBtnActive : {})}}
            onClick={() => setView('list')}
          >
            📝 List
          </button>
        </div>

        {/* Filters */}
        <div style={styles.filters}>
          <select
            style={styles.filterSelect}
            value={filters.status}
            onChange={(e) => setFilters({...filters, status: e.target.value})}
          >
            <option value="">All Status</option>
            {statuses.map(s => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
          </select>

          <select
            style={styles.filterSelect}
            value={filters.priority}
            onChange={(e) => setFilters({...filters, priority: e.target.value})}
          >
            <option value="">All Priority</option>
            {priorities.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>

          <select
            style={styles.filterSelect}
            value={filters.assignee}
            onChange={(e) => setFilters({...filters, assignee: e.target.value})}
          >
            <option value="">All Assignees</option>
            {agents.map(a => <option key={a.id} value={a.id}>🤖 {a.name}</option>)}
          </select>

          <input
            type="text"
            placeholder="🔍 Search tasks..."
            style={styles.searchInput}
            value={filters.search}
            onChange={(e) => setFilters({...filters, search: e.target.value})}
          />
        </div>

        <button style={styles.newTaskBtn} onClick={() => { resetForm(); setSelectedTask(null); setShowCreateModal(true); }}>
          ➕ New Task
        </button>
      </div>

      {/* KANBAN VIEW */}
      {view === 'kanban' && (
        <div style={styles.kanbanContainer}>
          {statuses.map(status => {
            const columnTasks = filteredTasks.filter(t => t.status === status);
            return (
              <div
                key={status}
                style={styles.kanbanColumn}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, status)}
              >
                <div style={styles.columnHeader}>
                  <h3 style={styles.columnTitle}>{getStatusLabel(status)}</h3>
                  <span style={styles.columnCount}>{columnTasks.length}</span>
                </div>
                <div style={styles.columnCards}>
                  {columnTasks.map(task => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task)}
                      style={styles.taskCard}
                      onClick={() => openDetailModal(task)}
                    >
                      <div style={styles.cardHeader}>
                        <h4 style={styles.cardTitle}>{task.title}</h4>
                        <span style={{...styles.priorityBadge, backgroundColor: getPriorityColor(task.priority)}}>
                          {task.priority}
                        </span>
                      </div>
                      {task.description && (
                        <p style={styles.cardDescription}>{task.description.substring(0, 80)}...</p>
                      )}
                      <div style={styles.cardFooter}>
                        {task.assignee_id && (
                          <span style={styles.assignee}>
                            🤖 {agents.find(a => a.id === task.assignee_id)?.name || task.assignee_id}
                          </span>
                        )}
                        {task.due_date && (
                          <span style={styles.dueDate}>
                            📅 {new Date(task.due_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {columnTasks.length === 0 && (
                    <div style={styles.emptyColumn}>No tasks</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* LIST VIEW */}
      {view === 'list' && (
        <div style={styles.listContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th} onClick={() => handleSort('title')}>
                  Title {sortColumn === 'title' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={styles.th} onClick={() => handleSort('status')}>
                  Status {sortColumn === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={styles.th} onClick={() => handleSort('priority')}>
                  Priority {sortColumn === 'priority' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={styles.th} onClick={() => handleSort('assignee_id')}>
                  Assignee {sortColumn === 'assignee_id' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={styles.th} onClick={() => handleSort('due_date')}>
                  Due Date {sortColumn === 'due_date' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={styles.th} onClick={() => handleSort('created_at')}>
                  Created {sortColumn === 'created_at' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedTasks.map(task => (
                <tr key={task.id} style={styles.tr} onClick={() => openDetailModal(task)}>
                  <td style={styles.td}>{task.title}</td>
                  <td style={styles.td}>
                    <span style={styles.statusBadge}>{getStatusLabel(task.status)}</span>
                  </td>
                  <td style={styles.td}>
                    <span style={{...styles.priorityBadge, backgroundColor: getPriorityColor(task.priority)}}>
                      {task.priority}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {task.assignee_id ? `🤖 ${agents.find(a => a.id === task.assignee_id)?.name || task.assignee_id}` : '—'}
                  </td>
                  <td style={styles.td}>
                    {task.due_date ? new Date(task.due_date).toLocaleDateString() : '—'}
                  </td>
                  <td style={styles.td}>
                    {new Date(task.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedTasks.length === 0 && (
            <div style={styles.emptyList}>No tasks found</div>
          )}
        </div>
      )}

      {/* CREATE/EDIT MODAL */}
      {showCreateModal && (
        <div style={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>{selectedTask ? 'Edit Task' : 'Create Task'}</h2>
              <button style={styles.closeBtn} onClick={() => { setShowCreateModal(false); setSelectedTask(null); }}>✕</button>
            </div>
            <div style={styles.modalBody}>
              <label style={styles.label}>
                Title *
                <input
                  type="text"
                  style={styles.input}
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  placeholder="Task title"
                />
              </label>

              <label style={styles.label}>
                Description
                <textarea
                  style={styles.textarea}
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Task description"
                  rows={4}
                />
              </label>

              <div style={styles.row}>
                <label style={styles.label}>
                  Status
                  <select
                    style={styles.select}
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value})}
                  >
                    {statuses.map(s => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
                  </select>
                </label>

                <label style={styles.label}>
                  Priority
                  <select
                    style={styles.select}
                    value={formData.priority}
                    onChange={(e) => setFormData({...formData, priority: e.target.value})}
                  >
                    {priorities.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </label>
              </div>

              <div style={styles.row}>
                <label style={styles.label}>
                  Assignee
                  <select
                    style={styles.select}
                    value={formData.assignee_id}
                    onChange={(e) => setFormData({...formData, assignee_id: e.target.value})}
                  >
                    <option value="">Unassigned</option>
                    {agents.map(a => <option key={a.id} value={a.id}>🤖 {a.name}</option>)}
                  </select>
                </label>

                <label style={styles.label}>
                  Due Date
                  <input
                    type="date"
                    style={styles.input}
                    value={formData.due_date}
                    onChange={(e) => setFormData({...formData, due_date: e.target.value})}
                  />
                </label>
              </div>
            </div>
            <div style={styles.modalFooter}>
              {selectedTask && (
                <button style={styles.deleteBtn} onClick={() => deleteTask(selectedTask.id)}>
                  🗑️ Delete
                </button>
              )}
              <div style={styles.modalActions}>
                <button style={styles.cancelBtn} onClick={() => { setShowCreateModal(false); setSelectedTask(null); }}>
                  Cancel
                </button>
                <button style={styles.saveBtn} onClick={saveTask} disabled={!formData.title}>
                  {selectedTask ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {showDetailModal && selectedTask && (
        <div style={styles.modalOverlay} onClick={() => setShowDetailModal(false)}>
          <div style={{...styles.modal, maxWidth: '700px'}} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>{selectedTask.title}</h2>
              <button style={styles.closeBtn} onClick={() => setShowDetailModal(false)}>✕</button>
            </div>

            {/* Tabs */}
            <div style={styles.tabs}>
              <button
                style={{...styles.tab, ...(detailTab === 'info' ? styles.tabActive : {})}}
                onClick={() => setDetailTab('info')}
              >
                ℹ️ Info
              </button>
              <button
                style={{...styles.tab, ...(detailTab === 'comments' ? styles.tabActive : {})}}
                onClick={() => setDetailTab('comments')}
              >
                💬 Comments ({comments.length})
              </button>
              <button
                style={{...styles.tab, ...(detailTab === 'activity' ? styles.tabActive : {})}}
                onClick={() => setDetailTab('activity')}
              >
                📝 Activity ({activity.length})
              </button>
            </div>

            <div style={styles.modalBody}>
              {/* INFO TAB */}
              {detailTab === 'info' && (
                <div style={styles.detailInfo}>
                  {selectedTask.description && (
                    <div style={styles.detailSection}>
                      <h4 style={styles.detailLabel}>Description</h4>
                      <p style={styles.detailText}>{selectedTask.description}</p>
                    </div>
                  )}
                  
                  <div style={styles.detailGrid}>
                    <div style={styles.detailSection}>
                      <h4 style={styles.detailLabel}>Status</h4>
                      <span style={styles.statusBadge}>{getStatusLabel(selectedTask.status)}</span>
                    </div>
                    
                    <div style={styles.detailSection}>
                      <h4 style={styles.detailLabel}>Priority</h4>
                      <span style={{...styles.priorityBadge, backgroundColor: getPriorityColor(selectedTask.priority)}}>
                        {selectedTask.priority}
                      </span>
                    </div>
                  </div>

                  <div style={styles.detailGrid}>
                    <div style={styles.detailSection}>
                      <h4 style={styles.detailLabel}>Assignee</h4>
                      <p style={styles.detailText}>
                        {selectedTask.assignee_id ? `🤖 ${agents.find(a => a.id === selectedTask.assignee_id)?.name || selectedTask.assignee_id}` : 'Unassigned'}
                      </p>
                    </div>
                    
                    <div style={styles.detailSection}>
                      <h4 style={styles.detailLabel}>Due Date</h4>
                      <p style={styles.detailText}>
                        {selectedTask.due_date ? new Date(selectedTask.due_date).toLocaleDateString() : 'No due date'}
                      </p>
                    </div>
                  </div>

                  <div style={styles.detailSection}>
                    <h4 style={styles.detailLabel}>Created</h4>
                    <p style={styles.detailText}>{new Date(selectedTask.created_at).toLocaleString()}</p>
                  </div>

                  <button style={styles.editBtn} onClick={() => { openEditModal(selectedTask); setShowDetailModal(false); }}>
                    ✏️ Edit Task
                  </button>
                </div>
              )}

              {/* COMMENTS TAB */}
              {detailTab === 'comments' && (
                <div style={styles.commentsTab}>
                  <div style={styles.commentsList}>
                    {comments.map(comment => (
                      <div key={comment.id} style={styles.comment}>
                        <div style={styles.commentHeader}>
                          <span style={styles.commentAuthor}>
                            {comment.author_type === 'agent' ? '🤖' : '👤'} {comment.author_id}
                          </span>
                          <span style={styles.commentDate}>
                            {new Date(comment.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p style={styles.commentBody}>{comment.body}</p>
                      </div>
                    ))}
                    {comments.length === 0 && (
                      <p style={styles.emptyComments}>No comments yet</p>
                    )}
                  </div>
                  
                  <div style={styles.commentForm}>
                    <textarea
                      style={styles.commentInput}
                      placeholder="Add a comment..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      rows={3}
                    />
                    <button
                      style={styles.commentBtn}
                      onClick={() => addComment(selectedTask.id)}
                      disabled={!newComment.trim()}
                    >
                      💬 Add Comment
                    </button>
                  </div>
                </div>
              )}

              {/* ACTIVITY TAB */}
              {detailTab === 'activity' && (
                <div style={styles.activityTab}>
                  {activity.map(item => (
                    <div key={item.id} style={styles.activityItem}>
                      <div style={styles.activityHeader}>
                        <span style={styles.activityActor}>
                          {item.actor_type === 'agent' ? '🤖' : '👤'} {item.actor_id}
                        </span>
                        <span style={styles.activityDate}>
                          {new Date(item.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p style={styles.activityAction}>
                        <strong>{item.action}</strong>
                        {item.old_value && item.new_value && (
                          <span> from <em>{item.old_value}</em> to <em>{item.new_value}</em></span>
                        )}
                      </p>
                    </div>
                  ))}
                  {activity.length === 0 && (
                    <p style={styles.emptyActivity}>No activity yet</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// STYLES
// ============================================================================
const styles = {
  container: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    backgroundColor: '#f5f7fa',
    minHeight: '100vh',
    padding: '20px'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    backgroundColor: '#1a1a2e'
  },
  spinner: {
    width: '50px',
    height: '50px',
    border: '4px solid rgba(0, 102, 255, 0.1)',
    borderTop: '4px solid #0066ff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  loadingText: {
    marginTop: '20px',
    color: '#fff',
    fontSize: '16px'
  },
  toolbar: {
    backgroundColor: '#1a1a2e',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '15px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  title: {
    color: '#fff',
    fontSize: '24px',
    fontWeight: 600,
    margin: 0,
    marginRight: 'auto'
  },
  viewToggle: {
    display: 'flex',
    gap: '5px',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: '8px',
    padding: '4px'
  },
  toggleBtn: {
    padding: '8px 16px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#fff',
    cursor: 'pointer',
    borderRadius: '6px',
    fontSize: '14px',
    transition: 'all 0.2s'
  },
  toggleBtnActive: {
    backgroundColor: '#0066ff',
    fontWeight: 600
  },
  filters: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap'
  },
  filterSelect: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    fontSize: '14px',
    cursor: 'pointer'
  },
  searchInput: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    fontSize: '14px',
    minWidth: '200px'
  },
  newTaskBtn: {
    padding: '10px 20px',
    backgroundColor: '#0066ff',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 2px 8px rgba(0, 102, 255, 0.3)'
  },
  kanbanContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '20px'
  },
  kanbanColumn: {
    backgroundColor: '#e8ecf1',
    borderRadius: '12px',
    padding: '15px',
    minHeight: '400px'
  },
  columnHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px'
  },
  columnTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1a1a2e',
    margin: 0,
    textTransform: 'capitalize'
  },
  columnCount: {
    backgroundColor: '#1a1a2e',
    color: '#fff',
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 600
  },
  columnCards: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  taskCard: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '15px',
    cursor: 'move',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
    transition: 'all 0.2s'
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '8px',
    gap: '10px'
  },
  cardTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#1a1a2e',
    margin: 0,
    flex: 1
  },
  priorityBadge: {
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#fff',
    textTransform: 'uppercase'
  },
  cardDescription: {
    fontSize: '13px',
    color: '#666',
    margin: '8px 0',
    lineHeight: 1.4
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '10px',
    fontSize: '12px',
    color: '#666'
  },
  assignee: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  dueDate: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  emptyColumn: {
    textAlign: 'center',
    color: '#999',
    padding: '20px',
    fontSize: '14px'
  },
  listContainer: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  th: {
    textAlign: 'left',
    padding: '12px',
    borderBottom: '2px solid #e8ecf1',
    color: '#1a1a2e',
    fontWeight: 600,
    fontSize: '14px',
    cursor: 'pointer',
    userSelect: 'none'
  },
  tr: {
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  td: {
    padding: '12px',
    borderBottom: '1px solid #f0f0f0',
    fontSize: '14px',
    color: '#333'
  },
  statusBadge: {
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 500,
    backgroundColor: '#e8ecf1',
    color: '#1a1a2e',
    textTransform: 'capitalize'
  },
  emptyList: {
    textAlign: 'center',
    color: '#999',
    padding: '40px',
    fontSize: '16px'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px'
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: '16px',
    maxWidth: '600px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid #e8ecf1',
    backgroundColor: '#1a1a2e'
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#fff',
    margin: 0
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    color: '#fff',
    cursor: 'pointer',
    padding: 0,
    width: '30px',
    height: '30px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    transition: 'background-color 0.2s'
  },
  modalBody: {
    padding: '24px',
    overflowY: 'auto',
    flex: 1
  },
  label: {
    display: 'block',
    marginBottom: '16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#1a1a2e'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #e0e0e0',
    fontSize: '14px',
    marginTop: '6px',
    boxSizing: 'border-box'
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #e0e0e0',
    fontSize: '14px',
    marginTop: '6px',
    fontFamily: 'inherit',
    resize: 'vertical',
    boxSizing: 'border-box'
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #e0e0e0',
    fontSize: '14px',
    marginTop: '6px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    boxSizing: 'border-box'
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px'
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    borderTop: '1px solid #e8ecf1',
    backgroundColor: '#f9fafb'
  },
  deleteBtn: {
    padding: '10px 20px',
    backgroundColor: '#ef4444',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer'
  },
  modalActions: {
    display: 'flex',
    gap: '10px'
  },
  cancelBtn: {
    padding: '10px 20px',
    backgroundColor: '#e8ecf1',
    color: '#1a1a2e',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer'
  },
  saveBtn: {
    padding: '10px 20px',
    backgroundColor: '#0066ff',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  tabs: {
    display: 'flex',
    borderBottom: '2px solid #e8ecf1',
    backgroundColor: '#f9fafb'
  },
  tab: {
    flex: 1,
    padding: '12px',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    fontSize: '14px',
    fontWeight: 500,
    color: '#666',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  tabActive: {
    color: '#0066ff',
    borderBottomColor: '#0066ff',
    fontWeight: 600
  },
  detailInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  detailSection: {
    marginBottom: '8px'
  },
  detailLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: '6px'
  },
  detailText: {
    fontSize: '14px',
    color: '#1a1a2e',
    margin: 0,
    lineHeight: 1.5
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px'
  },
  editBtn: {
    marginTop: '10px',
    padding: '10px 20px',
    backgroundColor: '#0066ff',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  commentsTab: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  commentsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
    maxHeight: '400px',
    overflowY: 'auto'
  },
  comment: {
    backgroundColor: '#f9fafb',
    padding: '12px',
    borderRadius: '8px',
    borderLeft: '3px solid #0066ff'
  },
  commentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px'
  },
  commentAuthor: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#1a1a2e'
  },
  commentDate: {
    fontSize: '12px',
    color: '#999'
  },
  commentBody: {
    fontSize: '14px',
    color: '#333',
    margin: 0,
    lineHeight: 1.5
  },
  emptyComments: {
    textAlign: 'center',
    color: '#999',
    padding: '20px',
    fontSize: '14px'
  },
  commentForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  commentInput: {
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #e0e0e0',
    fontSize: '14px',
    fontFamily: 'inherit',
    resize: 'vertical'
  },
  commentBtn: {
    alignSelf: 'flex-end',
    padding: '10px 20px',
    backgroundColor: '#0066ff',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  activityTab: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxHeight: '500px',
    overflowY: 'auto'
  },
  activityItem: {
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    borderLeft: '3px solid #6b7280'
  },
  activityHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '6px'
  },
  activityActor: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#1a1a2e'
  },
  activityDate: {
    fontSize: '12px',
    color: '#999'
  },
  activityAction: {
    fontSize: '13px',
    color: '#333',
    margin: 0
  },
  emptyActivity: {
    textAlign: 'center',
    color: '#999',
    padding: '20px',
    fontSize: '14px'
  }
};

export default TasksPage;
