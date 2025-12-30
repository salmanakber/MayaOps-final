-- Create task_assignments table for multiple cleaner assignments
CREATE TABLE IF NOT EXISTS task_assignments (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, user_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_task_assignments_task ON task_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_user ON task_assignments(user_id);

-- Migrate existing assignedUserId data to task_assignments
-- This ensures backward compatibility with existing tasks
INSERT INTO task_assignments (task_id, user_id, created_at)
SELECT id, assigned_user_id, created_at
FROM tasks
WHERE assigned_user_id IS NOT NULL
ON CONFLICT (task_id, user_id) DO NOTHING;


