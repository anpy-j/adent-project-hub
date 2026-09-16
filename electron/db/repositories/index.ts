import { getDb } from '../index'
import { randomUUID } from 'crypto'
import type { Project, ProjectRemote, Workspace } from '../../../src/types'

function parseTags(tags: string | null): string[] | null {
  if (!tags) return null
  try {
    return JSON.parse(tags) as string[]
  } catch {
    return null
  }
}

export const workspaceRepo = {
  list(): Workspace[] {
    return getDb()
      .prepare('SELECT * FROM workspace ORDER BY sort_order ASC')
      .all() as Workspace[]
  }
}

export const remoteRepo = {
  listByProject(projectId: string): ProjectRemote[] {
    return getDb()
      .prepare('SELECT * FROM project_remote WHERE project_id = ? ORDER BY is_default DESC, name ASC')
      .all(projectId) as ProjectRemote[]
  },
  replaceAll(projectId: string, remotes: Array<Omit<ProjectRemote, 'id' | 'project_id'>>): ProjectRemote[] {
    // 防御：空结果不清空已有关联（避免识别失败导致误删）
    if (!remotes.length) {
      return this.listByProject(projectId)
    }
    const db = getDb()
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM project_remote WHERE project_id = ?').run(projectId)
      const ins = db.prepare(
        'INSERT INTO project_remote (id, project_id, name, url, platform, is_default) VALUES (@id, @project_id, @name, @url, @platform, @is_default)'
      )
      for (const r of remotes) {
        ins.run({ id: randomUUID(), project_id: projectId, name: r.name, url: r.url, platform: r.platform, is_default: r.is_default ? 1 : 0 })
      }
    })
    tx()
    return this.listByProject(projectId)
  },}

function withDefaults(row: Project | undefined): Project | null {
  if (!row) return null
  return {
    ...row,
    progress_percent: row.progress_percent ?? 0,
    progress_stage: row.progress_stage ?? 'planning',
    progress_note: row.progress_note ?? '',
    remotes: remoteRepo.listByProject(row.id)
  }
}

export const projectRepo = {
  list(workspaceId?: string): Project[] {
    const db = getDb()
    const rows = (
      workspaceId
        ? db.prepare('SELECT * FROM project WHERE workspace_id = ? ORDER BY updated_at DESC').all(workspaceId)
        : db.prepare('SELECT * FROM project ORDER BY updated_at DESC').all()
    ) as Project[]
    return rows.map((r) => ({
      ...r,
      progress_percent: r.progress_percent ?? 0,
      progress_stage: r.progress_stage ?? 'planning',
      progress_note: r.progress_note ?? '',
      remotes: remoteRepo.listByProject(r.id)
    }))
  },

  get(id: string): Project | null {
    const row = getDb()
      .prepare('SELECT * FROM project WHERE id = ?')
      .get(id) as Project | undefined
    return withDefaults(row)
  },

  insert(data: {
    id: string
    workspace_id: string
    name: string
    path: string
    type: string
    framework: string | null
    description: string | null
    remotes?: Array<{ name: string; url: string; platform: string; is_default: number }>
  }): Project {
    const db = getDb()
    db.prepare(
      `INSERT INTO project (id, workspace_id, name, path, type, framework, description)
       VALUES (@id, @workspace_id, @name, @path, @type, @framework, @description)`
    ).run(data)
    if (data.remotes?.length) {
      remoteRepo.replaceAll(
        data.id,
        data.remotes.map((r) => ({
          name: r.name,
          url: r.url,
          platform: r.platform as ProjectRemote['platform'],
          is_default: r.is_default ?? 0
        }))
      )
    }
    return this.get(data.id) as Project
  },

  update(id: string, data: Partial<Project>): Project {
    const db = getDb()
    const allowed: (keyof Project)[] = [
      'name', 'path', 'type', 'framework', 'runtime_id',
      'tags', 'description', 'last_run_at',
      'progress_percent', 'progress_stage', 'progress_note'
    ]
    const sets: string[] = []
    const values: Record<string, unknown> = { id }
    for (const key of allowed) {
      if (key in data) {
        sets.push(`${key} = @${key}`)
        let v: unknown = data[key]
        if (key === 'tags' && Array.isArray(v)) v = JSON.stringify(v)
        values[key] = v
      }
    }
    sets.push(`updated_at = datetime('now')`)
    db.prepare(`UPDATE project SET ${sets.join(', ')} WHERE id = @id`).run(values)
    return this.get(id) as Project
  },

  remove(id: string): void {
    getDb().prepare('DELETE FROM project WHERE id = ?').run(id)
  }
}
