import { apiClient } from "./client"

export type DocumentRole = "owner" | "editor" | "viewer"

export interface Collaborator {
  _id: string
  username: string
  email: string
  role: DocumentRole
}

export type VectorClock = {
  [userId: string]: number
}

export interface DocumentItem {
  _id: string
  title?: string
  ownerId: string | { _id: string; username: string; email: string }
  collaborators: Collaborator[]
  global_v_clock: VectorClock
  content_snapshot?: string
  created_at?: string
  updated_at?: string
}

export interface DocumentApiResponse {
  success: boolean
  message?: string
  document?: DocumentItem
  documents?: DocumentItem[]
}

// ── Lấy toàn bộ tài liệu của user ──────────────────────────────────────────
export async function getUserDocumentsApi(userId: string): Promise<DocumentApiResponse> {
  const res = await apiClient.get<DocumentApiResponse>(`/users/${encodeURIComponent(userId)}/documents`)
  return res.data
}

// ── Lấy tài liệu được chia sẻ ──────────────────────────────────────────────
export async function getSharedDocumentsApi(userId: string): Promise<DocumentApiResponse> {
  const res = await apiClient.get<DocumentApiResponse>(`/users/${encodeURIComponent(userId)}/documents/shared`)
  return res.data
}

// ── Tạo tài liệu mới ───────────────────────────────────────────────────────
export async function createDocumentApi(ownerId: string, title = "Tài liệu chưa có tiêu đề"): Promise<DocumentApiResponse> {
  const res = await apiClient.post<DocumentApiResponse>(`/documents`, { ownerId, title })
  return res.data
}

// ── Lấy chi tiết 1 tài liệu ────────────────────────────────────────────────
export async function getDocumentApi(docId: string, requesterId?: string): Promise<DocumentApiResponse> {
  const url = `/documents/${encodeURIComponent(docId)}${requesterId ? `?requesterId=${encodeURIComponent(requesterId)}` : ""}`
  const res = await apiClient.get<DocumentApiResponse>(url)
  return res.data
}

// ── Đổi tiêu đề tài liệu ───────────────────────────────────────────────────
export async function updateDocumentTitleApi(docId: string, title: string): Promise<DocumentApiResponse> {
  const res = await apiClient.put<DocumentApiResponse>(`/documents/${encodeURIComponent(docId)}`, { title })
  return res.data
}

// ── Xóa tài liệu ───────────────────────────────────────────────────────────
export async function deleteDocumentApi(docId: string): Promise<DocumentApiResponse> {
  const res = await apiClient.delete<DocumentApiResponse>(`/documents/${encodeURIComponent(docId)}`)
  return res.data
}

// ── Thêm cộng tác viên (theo email) ────────────────────────────────────────
export async function addCollaboratorApi(docId: string, email: string, role: DocumentRole = "editor", requesterId?: string): Promise<DocumentApiResponse> {
  const body: any = { email, role }
  if (requesterId) body.requesterId = requesterId
  const res = await apiClient.post<DocumentApiResponse>(`/documents/${encodeURIComponent(docId)}/collaborators`, body)
  return res.data
}

// ── Xóa cộng tác viên ──────────────────────────────────────────────────────
export async function removeCollaboratorApi(docId: string, collaboratorId: string, requesterId?: string): Promise<DocumentApiResponse> {
  const url = `/documents/${encodeURIComponent(docId)}/collaborators/${encodeURIComponent(collaboratorId)}${requesterId ? `?requesterId=${encodeURIComponent(requesterId)}` : ""}`
  const res = await apiClient.delete<DocumentApiResponse>(url)
  return res.data
}

// ── Đổi role cộng tác viên ─────────────────────────────────────────────────
export async function updateCollaboratorRoleApi(docId: string, collaboratorId: string, role: DocumentRole, requesterId?: string): Promise<DocumentApiResponse> {
  const body: any = { role }
  if (requesterId) body.requesterId = requesterId
  const res = await apiClient.put<DocumentApiResponse>(`/documents/${encodeURIComponent(docId)}/collaborators/${encodeURIComponent(collaboratorId)}/role`, body)
  return res.data
}
