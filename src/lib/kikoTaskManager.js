// KikoTaskManager — global singleton for background task persistence
// Lives on window so it survives React component unmounts during navigation

class KikoTaskManager {
  constructor() {
    this.tasks = new Map() // taskId → { status, query, response, startedAt, completedAt, conversationId }
    this.listeners = new Set()
  }

  // Register a new background task
  startTask(taskId, query, conversationId) {
    this.tasks.set(taskId, {
      status: 'running', query, response: '', startedAt: Date.now(),
      completedAt: null, conversationId, abortController: new AbortController(),
    })
    this._notify()
    return this.tasks.get(taskId).abortController
  }

  // Append streaming text to a task
  appendToTask(taskId, text) {
    const task = this.tasks.get(taskId)
    if (task) { task.response += text; this._notify() }
  }

  // Mark task complete
  completeTask(taskId) {
    const task = this.tasks.get(taskId)
    if (task) {
      task.status = 'completed'
      task.completedAt = Date.now()
      this._notify()
      // Dispatch global event for notification toast
      window.dispatchEvent(new CustomEvent('kiko_task_complete', {
        detail: { taskId, query: task.query, response: task.response, conversationId: task.conversationId }
      }))
    }
  }

  // Stop a running task
  stopTask(taskId) {
    const task = this.tasks.get(taskId)
    if (task?.abortController) {
      task.abortController.abort()
      task.status = 'stopped'
      task.completedAt = Date.now()
      this._notify()
    }
  }

  // Get all running tasks
  getRunningTasks() {
    return [...this.tasks.values()].filter(t => t.status === 'running')
  }

  // Get completed tasks (not yet viewed)
  getCompletedTasks() {
    return [...this.tasks.entries()].filter(([, t]) => t.status === 'completed').map(([id, t]) => ({ id, ...t }))
  }

  // Dismiss a completed task
  dismissTask(taskId) {
    this.tasks.delete(taskId)
    this._notify()
  }

  // Subscribe to changes
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn) }
  _notify() { this.listeners.forEach(fn => fn()) }
}

// Singleton on window
if (!window.kikoTaskManager) window.kikoTaskManager = new KikoTaskManager()
export default window.kikoTaskManager
