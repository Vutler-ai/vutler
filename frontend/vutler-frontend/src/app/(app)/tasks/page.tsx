"use client";

import { useState, useEffect } from "react";

interface Task {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  assigned_to: string;
  due_date: string;
}

const AGENTS = ["Mike", "Philip", "Luna", "Max", "Victor", "Oscar", "Nora", "Andrea", "Stephen", "Jarvis"];

const PRIORITY_COLORS = {
  high: "🔴",
  medium: "🟡",
  low: "🟢",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium" as Task["priority"],
    assigned_to: AGENTS[0],
    due_date: "",
  });

  const fetchTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/tasks");
      if (!res.ok) throw new Error("Failed to fetch tasks");
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : data.tasks || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleCreateTask = async () => {
    if (!formData.title) return;
    try {
      const res = await fetch("/api/v1/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, status: "todo" }),
      });
      if (!res.ok) throw new Error("Failed to create task");
      await fetchTasks();
      resetForm();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateTask = async () => {
    if (!editingTask || !formData.title) return;
    try {
      const res = await fetch(`/api/v1/tasks/${editingTask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editingTask, ...formData }),
      });
      if (!res.ok) throw new Error("Failed to update task");
      await fetchTasks();
      resetForm();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm("Delete this task?")) return;
    try {
      const res = await fetch(`/api/v1/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete task");
      await fetchTasks();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleStatusChange = async (task: Task, newStatus: Task["status"]) => {
    try {
      const res = await fetch(`/api/v1/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...task, status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update task status");
      await fetchTasks();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("taskId", task.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, status: Task["status"]) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("taskId");
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== status) {
      handleStatusChange(task, status);
    }
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingTask(null);
    setFormData({
      title: "",
      description: "",
      priority: "medium",
      assigned_to: AGENTS[0],
      due_date: "",
    });
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description,
      priority: task.priority,
      assigned_to: task.assigned_to,
      due_date: task.due_date,
    });
    setShowModal(true);
  };

  const columns: { status: Task["status"]; label: string }[] = [
    { status: "todo", label: "To Do" },
    { status: "in_progress", label: "In Progress" },
    { status: "done", label: "Done" },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Task Manager</h1>
          <p className="text-sm text-[#9ca3af]">Organize your work</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="px-4 py-2 bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb] transition"
        >
          + New Task
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Kanban Board */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[#9ca3af]">
          Loading tasks...
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-3 gap-4 overflow-hidden">
          {columns.map((column) => {
            const columnTasks = tasks.filter((t) => t.status === column.status);
            return (
              <div
                key={column.status}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, column.status)}
                className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 flex flex-col"
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">{column.label}</h2>
                  <span className="text-sm text-[#6b7280]">{columnTasks.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3">
                  {columnTasks.length === 0 ? (
                    <div className="text-center text-[#6b7280] py-8 text-sm">
                      No tasks
                    </div>
                  ) : (
                    columnTasks.map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task)}
                        onClick={() => openEditModal(task)}
                        className="bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg p-4 cursor-pointer hover:border-[#3b82f6] transition group"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="text-white font-semibold flex-1">{task.title}</h3>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTask(task.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition ml-2"
                          >
                            ✕
                          </button>
                        </div>
                        {task.description && (
                          <p className="text-sm text-[#9ca3af] mb-3 line-clamp-2">
                            {task.description}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1">
                            {PRIORITY_COLORS[task.priority]}{" "}
                            <span className="text-[#6b7280] capitalize">{task.priority}</span>
                          </span>
                          <span className="text-[#6b7280]">{task.assigned_to}</span>
                        </div>
                        {task.due_date && (
                          <div className="text-xs text-[#6b7280] mt-2">
                            Due: {new Date(task.due_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Task Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingTask ? "Edit Task" : "New Task"}
            </h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Task title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-[#6b7280] focus:outline-none focus:border-[#3b82f6]"
              />
              <textarea
                placeholder="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-[#6b7280] focus:outline-none focus:border-[#3b82f6] resize-none"
              />
              <select
                value={formData.priority}
                onChange={(e) =>
                  setFormData({ ...formData, priority: e.target.value as Task["priority"] })
                }
                className="w-full px-4 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white focus:outline-none focus:border-[#3b82f6]"
              >
                <option value="low">🟢 Low Priority</option>
                <option value="medium">🟡 Medium Priority</option>
                <option value="high">🔴 High Priority</option>
              </select>
              <select
                value={formData.assigned_to}
                onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                className="w-full px-4 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white focus:outline-none focus:border-[#3b82f6]"
              >
                {AGENTS.map((agent) => (
                  <option key={agent} value={agent}>
                    {agent}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                className="w-full px-4 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white focus:outline-none focus:border-[#3b82f6]"
              />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={resetForm}
                className="px-4 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] text-white rounded-lg hover:bg-[#14151f] transition"
              >
                Cancel
              </button>
              <button
                onClick={editingTask ? handleUpdateTask : handleCreateTask}
                disabled={!formData.title}
                className="px-4 py-2 bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb] transition disabled:opacity-50"
              >
                {editingTask ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
