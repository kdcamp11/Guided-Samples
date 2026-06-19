'use client'

import { useState, useEffect } from 'react'
import {
  Plus, Trash2, Loader2, FolderOpen, Sparkles, Search,
  Pencil, Check, X, Folder, FolderPlus, FolderInput, CheckSquare, Square, ChevronDown,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import {
  listProjects, deleteProject, renameProject,
  listFolders, createFolder, renameFolder, deleteFolder, moveProjectsToFolder,
} from '@/lib/projects'
import type { Project, Folder as FolderType } from '@/lib/projects'

interface Props {
  onNewProject: () => void
  onOpenProject: (projectId: string) => void
}

type ConfirmState = {
  title: string
  body?: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
} | null

// Folder ID or null for "All Projects"
type FolderTarget = string | null

export default function ProjectsDashboard({ onNewProject, onOpenProject }: Props) {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [folders, setFolders] = useState<FolderType[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const [activeFolder, setActiveFolder] = useState<FolderTarget>(null)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editFolderName, setEditFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [foldersOpen, setFoldersOpen] = useState(true)

  // Drag-and-drop
  const [dragOverFolder, setDragOverFolder] = useState<FolderTarget | 'none'>(null)

  // Multi-select
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [moveOpen, setMoveOpen] = useState(false)

  const [confirmState, setConfirmState] = useState<ConfirmState>(null)

  useEffect(() => {
    if (!user) return
    Promise.all([listProjects(user.id), listFolders(user.id)]).then(([p, f]) => {
      setProjects(p)
      setFolders(f)
      setLoading(false)
    })
  }, [user])

  // ── Projects ────────────────────────────────────────────────────────────────
  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmState({
      title: 'Delete this project?',
      body: 'This permanently removes the design and its files.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        await deleteProject(id)
        setProjects(ps => ps.filter(p => p.id !== id))
        setSelected(s => { const n = new Set(s); n.delete(id); return n })
      },
    })
  }

  const startRename = (p: Project, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(p.id)
    setEditName(p.name)
  }

  const commitRename = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const name = editName.trim()
    setEditingId(null)
    if (!name) return
    setProjects(ps => ps.map(p => (p.id === id ? { ...p, name } : p)))
    await renameProject(id, name)
  }

  // ── Folders ──────────────────────────────────────────────────────────────────
  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    setCreatingFolder(false)
    setNewFolderName('')
    if (!name || !user) return
    const folder = await createFolder(user.id, name)
    if (folder) setFolders(fs => [...fs, folder])
  }

  const commitFolderRename = async (id: string) => {
    const name = editFolderName.trim()
    setEditingFolderId(null)
    if (!name) return
    setFolders(fs => fs.map(f => (f.id === id ? { ...f, name } : f)))
    await renameFolder(id, name)
  }

  const handleDeleteFolder = (folder: FolderType) => {
    setConfirmState({
      title: `Delete "${folder.name}"?`,
      body: 'The folder is removed but its projects are kept and moved back to All Projects.',
      confirmLabel: 'Delete Folder',
      danger: true,
      onConfirm: async () => {
        await deleteFolder(folder.id)
        setFolders(fs => fs.filter(f => f.id !== folder.id))
        setProjects(ps => ps.map(p => (p.folder_id === folder.id ? { ...p, folder_id: null } : p)))
        if (activeFolder === folder.id) setActiveFolder(null)
      },
    })
  }

  // ── Multi-select ─────────────────────────────────────────────────────────────
  const selectCard = (id: string) => {
    if (!selectMode) setSelectMode(true)
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
    setMoveOpen(false)
  }

  const moveTo = async (projectIds: string[], folderId: FolderTarget) => {
    if (projectIds.length === 0) return
    setProjects(ps => ps.map(p => (projectIds.includes(p.id) ? { ...p, folder_id: folderId } : p)))
    await moveProjectsToFolder(projectIds, folderId)
  }

  const handleBulkMove = async (folderId: FolderTarget) => {
    setMoveOpen(false)
    await moveTo(Array.from(selected), folderId)
    exitSelectMode()
  }

  const handleBulkDelete = () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setConfirmState({
      title: `Delete ${ids.length} project${ids.length > 1 ? 's' : ''}?`,
      body: "This permanently removes the selected designs. This can’t be undone.",
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        await Promise.all(ids.map(id => deleteProject(id)))
        setProjects(ps => ps.filter(p => !selected.has(p.id)))
        exitSelectMode()
      },
    })
  }

  // ── Drag-and-drop ────────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, projectId: string) => {
    e.dataTransfer.setData('projectId', projectId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleFolderDrop = async (e: React.DragEvent, folderId: FolderTarget) => {
    e.preventDefault()
    setDragOverFolder(null)
    const projectId = e.dataTransfer.getData('projectId')
    if (!projectId) return
    await moveTo([projectId], folderId)
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const inFolder = projects.filter(p => (activeFolder ? p.folder_id === activeFolder : true))
  const filtered = inFolder.filter(p =>
    p.name.toLowerCase().includes(query.trim().toLowerCase()))
  const folderCount = (id: FolderTarget) =>
    projects.filter(p => (id ? p.folder_id === id : true)).length

  const allFolderItems: { id: FolderTarget; label: string }[] = [
    { id: null, label: 'All Projects' },
    ...folders.map(f => ({ id: f.id, label: f.name })),
  ]

  return (
    <div className="bg-gray-50 min-h-full">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Projects</h1>
            <p className="text-sm text-gray-500 mt-1">Pick up where you left off, or start something new.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search projects…" className="input-field pl-9 w-48"/>
              {query && (
                <button onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-600">
                  <X size={14}/>
                </button>
              )}
            </div>
            <button onClick={() => setFoldersOpen(o => !o)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-gray-600 hover:bg-slate-50 transition-colors">
              <Folder size={15} className="text-gray-400"/>
              Folders
              <span className="text-[11px] text-gray-400">{folders.length}</span>
              <ChevronDown size={15} className={`text-gray-400 transition-transform ${foldersOpen ? 'rotate-180' : ''}`}/>
            </button>
            {!loading && projects.length > 0 && (
              selectMode ? (
                <button onClick={exitSelectMode}
                  className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-slate-200 text-gray-600 hover:bg-slate-50 transition-colors">
                  <X size={14}/> Cancel
                </button>
              ) : (
                <button onClick={() => setSelectMode(true)}
                  className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-slate-200 text-gray-600 hover:bg-slate-50 transition-colors">
                  <CheckSquare size={14}/> Select
                </button>
              )
            )}
            <button onClick={onNewProject} className="btn-primary flex items-center gap-2">
              <Plus size={14}/> New Project
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
            <Loader2 size={20} className="animate-spin text-brand-green"/>
            <span className="text-sm">Loading projects…</span>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-brand-green/10 flex items-center justify-center mx-auto mb-4">
              <Sparkles size={28} className="text-brand-green"/>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">No projects yet</h3>
            <p className="text-xs text-gray-400 mb-6">Create your first design to get started.</p>
            <button onClick={onNewProject} className="btn-primary flex items-center gap-2 mx-auto">
              <Plus size={14}/> Start First Project
            </button>
          </div>
        ) : (
          <div>

            {/* Folder accordion content — chips sit under the right-side controls */}
            {foldersOpen && (
              <div className="flex flex-wrap items-center justify-end gap-2 mb-6">
                {allFolderItems.map(({ id, label }) => {
                  const folderData = id ? folders.find(f => f.id === id) : null
                  if (editingFolderId === id) {
                    return (
                      <div key={id ?? '__all__'} className="flex items-center gap-1 px-2 py-1 rounded-full border border-slate-200 bg-white">
                        <input autoFocus value={editFolderName}
                          onChange={e => setEditFolderName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitFolderRename(id!)
                            if (e.key === 'Escape') setEditingFolderId(null)
                          }}
                          className="text-xs py-0.5 px-1 min-w-0 w-28 outline-none bg-transparent"/>
                        <button onClick={() => commitFolderRename(id!)} className="text-brand-green shrink-0"><Check size={13}/></button>
                      </div>
                    )
                  }
                  return (
                    <div key={id ?? '__all__'}
                      onClick={() => setActiveFolder(id)}
                      onDragOver={e => { e.preventDefault(); setDragOverFolder(id) }}
                      onDragLeave={() => setDragOverFolder(null)}
                      onDrop={e => handleFolderDrop(e, id)}
                      className={`group shrink-0 flex items-center gap-1.5 pl-3 pr-2.5 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                        dragOverFolder === id ? 'bg-brand-green/10 border border-brand-green/50 border-dashed' :
                        activeFolder === id ? 'bg-grace-ink text-white' :
                        'bg-white border border-slate-200 text-gray-600 hover:border-grace-ink'
                      }`}>
                      {id ? <Folder size={12}/> : <FolderOpen size={12}/>}
                      {label}
                      <span className="text-[10px] opacity-60">{folderCount(id)}</span>
                      {folderData && (
                        <span className="hidden group-hover:flex items-center gap-1 ml-0.5">
                          <button onClick={e => { e.stopPropagation(); setEditingFolderId(id); setEditFolderName(label) }}
                            className={activeFolder === id ? 'text-white/70 hover:text-white' : 'text-gray-300 hover:text-brand-green'}>
                            <Pencil size={11}/>
                          </button>
                          <button onClick={e => { e.stopPropagation(); handleDeleteFolder(folderData) }}
                            className={activeFolder === id ? 'text-white/70 hover:text-red-300' : 'text-gray-300 hover:text-red-400'}>
                            <Trash2 size={11}/>
                          </button>
                        </span>
                      )}
                    </div>
                  )
                })}

                {creatingFolder ? (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-full border border-slate-200 bg-white">
                    <input autoFocus value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleCreateFolder()
                        if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') }
                      }}
                      placeholder="Folder name"
                      className="text-xs py-0.5 px-1 min-w-0 w-28 outline-none bg-transparent"/>
                    <button onClick={handleCreateFolder} className="text-brand-green shrink-0"><Check size={13}/></button>
                  </div>
                ) : (
                  <button onClick={() => setCreatingFolder(true)}
                    className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full">
                    <FolderPlus size={13}/> New Folder
                  </button>
                )}
              </div>
            )}

            {/* Main grid */}
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {!selectMode && (
                  <button onClick={onNewProject}
                    className="card border-dashed border-2 border-slate-200 hover:border-brand-green flex flex-col items-center justify-center py-10 gap-3 text-gray-400 hover:text-brand-green transition-colors group">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-brand-green/10 flex items-center justify-center transition-colors">
                      <Plus size={20}/>
                    </div>
                    <span className="text-xs font-medium">New Project</span>
                  </button>
                )}

                {filtered.length === 0 && (
                  <div className="col-span-full text-center py-12 text-sm text-gray-400">
                    {query ? `No projects match "${query}".` : 'No projects in this folder yet.'}
                  </div>
                )}

                {filtered.map(project => {
                  const isSelected = selected.has(project.id)
                  return (
                    <div key={project.id}
                      draggable={!selectMode}
                      onDragStart={e => handleDragStart(e, project.id)}
                      onClick={() => {
                        if (selectMode) selectCard(project.id)
                        else onOpenProject(project.id)
                      }}
                      className={`card cursor-pointer transition-colors group relative overflow-hidden select-none ${
                        isSelected ? 'border-brand-green ring-2 ring-brand-green/30' : 'hover:border-brand-green/30'
                      }`}>

                      {/* Hover / select checkbox — always visible on hover; in select mode always shown */}
                      <div
                        className={`absolute top-2 left-2 z-10 transition-opacity ${selectMode || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        onClick={e => { e.stopPropagation(); selectCard(project.id) }}>
                        {isSelected
                          ? <CheckSquare size={20} className="text-brand-green bg-white rounded shadow-sm"/>
                          : <Square size={20} className="text-gray-300 bg-white/90 rounded shadow-sm"/>}
                      </div>

                      {/* Thumbnail */}
                      <div className="bg-slate-50 rounded-lg mb-3 flex items-center justify-center overflow-hidden" style={{ height: 140 }}>
                        {project.thumbnail_url ? (
                          <img src={project.thumbnail_url} alt={project.name} className="w-full h-full object-contain p-3"/>
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-gray-300">
                            <FolderOpen size={28}/>
                            <span className="text-[10px]">No preview</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {editingId === project.id ? (
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') commitRename(project.id)
                                  if (e.key === 'Escape') setEditingId(null)
                                }}
                                className="input-field text-sm py-1 px-2 min-w-0 flex-1"/>
                              <button onClick={e => commitRename(project.id, e)} className="text-brand-green shrink-0"><Check size={14}/></button>
                              <button onClick={e => { e.stopPropagation(); setEditingId(null) }} className="text-gray-300 hover:text-gray-600 shrink-0"><X size={14}/></button>
                            </div>
                          ) : (
                            <p className="text-sm font-semibold text-gray-900 truncate">{project.name}</p>
                          )}
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            Phase {project.phase_reached} · {new Date(project.updated_at).toLocaleDateString()}
                          </p>
                        </div>
                        {!selectMode && editingId !== project.id && (
                          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                            <button onClick={e => startRename(project, e)}
                              className="text-gray-200 hover:text-brand-green opacity-0 group-hover:opacity-100 transition-all">
                              <Pencil size={13}/>
                            </button>
                            <button onClick={e => handleDelete(project.id, e)}
                              className="text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                              <Trash2 size={13}/>
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-green rounded-full" style={{ width: `${(project.phase_reached / 6) * 100}%` }}/>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">{project.phase_reached}/6 phases complete</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating bulk-action bar */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-3 rounded-2xl bg-grace-ink text-white shadow-xl">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="w-px h-5 bg-white/20"/>
          <div className="relative">
            <button onClick={() => setMoveOpen(o => !o)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors">
              <FolderInput size={15}/> Move to…
            </button>
            {moveOpen && (
              <div className="absolute bottom-full mb-2 left-0 w-52 bg-white text-gray-700 rounded-xl shadow-xl border border-slate-200 py-1 max-h-64 overflow-y-auto">
                <button onClick={() => handleBulkMove(null)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-left">
                  <FolderOpen size={14}/> All Projects (top level)
                </button>
                {folders.length > 0 && <div className="my-1 border-t border-slate-100"/>}
                {folders.map(f => (
                  <button key={f.id} onClick={() => handleBulkMove(f.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-left truncate">
                    <Folder size={14}/> {f.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={handleBulkDelete}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg hover:bg-white/10 text-red-300 transition-colors">
            <Trash2 size={15}/> Delete
          </button>
        </div>
      )}

      {/* In-app confirm modal */}
      {confirmState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setConfirmState(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900">{confirmState.title}</h3>
            {confirmState.body && <p className="text-sm text-gray-500 mt-2">{confirmState.body}</p>}
            <div className="flex items-center justify-end gap-2 mt-6">
              <button onClick={() => setConfirmState(null)}
                className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-gray-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => { const c = confirmState; setConfirmState(null); c?.onConfirm() }}
                className={`text-sm px-4 py-2 rounded-lg text-white font-medium transition-colors ${
                  confirmState.danger ? 'bg-red-500 hover:bg-red-600' : 'bg-grace-ink hover:bg-zinc-800'
                }`}>
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

