import { useState, useEffect, useCallback, KeyboardEvent } from 'react';
import './App.css';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

type FilterType = 'all' | 'active' | 'completed';

const STORAGE_KEY = 'react-todo-app-data';

function App() {
  const [todos, setTodos] = useState<Todo[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  const [inputValue, setInputValue] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // 持久化到 localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  // 添加 Todo
  const addTodo = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    const newTodo: Todo = {
      id: Date.now().toString(),
      text: trimmed,
      completed: false,
    };
    setTodos((prev) => [newTodo, ...prev]);
    setInputValue('');
  }, [inputValue]);

  // 删除 Todo
  const deleteTodo = useCallback((id: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id));
  }, []);

  // 切换完成状态
  const toggleTodo = useCallback((id: string) => {
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
  }, []);

  // 开始编辑
  const startEdit = useCallback((todo: Todo) => {
    setEditingId(todo.id);
    setEditText(todo.text);
  }, []);

  // 保存编辑
  const saveEdit = useCallback(() => {
    const trimmed = editText.trim();
    if (trimmed && editingId) {
      setTodos((prev) =>
        prev.map((todo) =>
          todo.id === editingId ? { ...todo, text: trimmed } : todo
        )
      );
    }
    setEditingId(null);
    setEditText('');
  }, [editText, editingId]);

  // 取消编辑
  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText('');
  }, []);

  // 键盘事件
  const handleEditKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        saveEdit();
      } else if (e.key === 'Escape') {
        cancelEdit();
      }
    },
    [saveEdit, cancelEdit]
  );

  const handleInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        addTodo();
      }
    },
    [addTodo]
  );

  // 清除已完成
  const clearCompleted = useCallback(() => {
    setTodos((prev) => prev.filter((todo) => !todo.completed));
  }, []);

  // 筛选后的 todos
  const filteredTodos = todos.filter((todo) => {
    if (filter === 'active') return !todo.completed;
    if (filter === 'completed') return todo.completed;
    return true;
  });

  // 统计信息
  const totalCount = todos.length;
  const activeCount = todos.filter((t) => !t.completed).length;
  const completedCount = todos.filter((t) => t.completed).length;

  return (
    <div className="todo-app">
      {/* 头部 */}
      <header className="todo-header">
        <h1 className="todo-title">
          <span className="title-icon">📝</span>
          我的任务清单
        </h1>
        <p className="todo-subtitle">记录每一天，成就更好的自己</p>
      </header>

      {/* 输入框 */}
      <div className="todo-input-wrapper">
        <input
          type="text"
          className="todo-input"
          placeholder="✍️ 添加一个新任务..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
        />
        <button className="todo-add-btn" onClick={addTodo}>
          <span className="btn-icon">＋</span>
          添加
        </button>
      </div>

      {/* 筛选器 */}
      <div className="todo-filter-bar">
        {(['all', 'active', 'completed'] as FilterType[]).map((f) => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'filter-btn--active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? '📋 全部' : f === 'active' ? '🔄 进行中' : '✅ 已完成'}
          </button>
        ))}
      </div>

      {/* 列表 */}
      <ul className="todo-list">
        {filteredTodos.length === 0 ? (
          <li className="todo-empty">
            <span className="empty-icon">🎉</span>
            <p>{todos.length === 0 ? '还没有任务，快来添加第一个吧！' : '没有匹配的任务'}</p>
          </li>
        ) : (
          filteredTodos.map((todo) => (
            <li
              key={todo.id}
              className={`todo-item ${todo.completed ? 'todo-item--completed' : ''}`}
            >
              {/* 复选框 */}
              <label className="todo-checkbox-label">
                <input
                  type="checkbox"
                  className="todo-checkbox"
                  checked={todo.completed}
                  onChange={() => toggleTodo(todo.id)}
                />
                <span className="checkmark"></span>
              </label>

              {/* 文本 / 编辑输入框 */}
              {editingId === todo.id ? (
                <input
                  type="text"
                  className="todo-edit-input"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  onBlur={saveEdit}
                  autoFocus
                />
              ) : (
                <span
                  className="todo-text"
                  onDoubleClick={() => startEdit(todo)}
                  title="双击编辑"
                >
                  {todo.text}
                </span>
              )}

              {/* 操作按钮 */}
              <div className="todo-actions">
                {editingId === todo.id ? (
                  <>
                    <button className="action-btn action-btn--save" onClick={saveEdit} title="保存">
                      💾
                    </button>
                    <button className="action-btn action-btn--cancel" onClick={cancelEdit} title="取消">
                      ❌
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="action-btn action-btn--edit"
                      onClick={() => startEdit(todo)}
                      title="编辑"
                    >
                      ✏️
                    </button>
                    <button
                      className="action-btn action-btn--delete"
                      onClick={() => deleteTodo(todo.id)}
                      title="删除"
                    >
                      🗑️
                    </button>
                  </>
                )}
              </div>
            </li>
          ))
        )}
      </ul>

      {/* 底部统计 */}
      {todos.length > 0 && (
        <footer className="todo-footer">
          <div className="footer-stats">
            <span className="stat-item stat-total">📊 总计：{totalCount}</span>
            <span className="stat-item stat-active">🔄 进行中：{activeCount}</span>
            <span className="stat-item stat-completed">✅ 已完成：{completedCount}</span>
          </div>
          {completedCount > 0 && (
            <button className="clear-btn" onClick={clearCompleted}>
              🧹 清除已完成
            </button>
          )}
        </footer>
      )}
    </div>
  );
}

export default App;
