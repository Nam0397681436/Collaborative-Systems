"use client"

import { useState, useEffect, useCallback, use, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { getApiBaseUrl } from "@/lib/api/client"
import {
  getDocumentApi,
  updateDocumentTitleApi,
  deleteDocumentApi,
  addCollaboratorApi,
  removeCollaboratorApi,
  updateCollaboratorRoleApi,
  type DocumentItem,
  type Collaborator,
  type DocumentRole,
  type VectorClock,
} from "@/lib/api/documents"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  FileText,
  ArrowLeft,
  Share2,
  MoreHorizontal,
  Star,
  Download,
  History,
  ChevronDown,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link2,
  Image,
  Undo,
  Redo,
  Clock,
  Loader2,
} from "lucide-react"
import { CollaboratorsSidebar } from "@/components/collaborators-sidebar"
import ShareDialog from "@/components/share-dialog"
import DocumentContentEditor, { Cursor, Operation } from "@/components/document-content-editor"
import { toast } from "sonner"



function toSidebarUser(c: Collaborator, color: string, idx: number, isOnline: boolean) {
  return {
    id: c._id,
    name: c.username ?? c.email ?? "Unknown",
    email: c.email ?? "",
    color: color,
    isOnline,
    role: c.role as "owner" | "editor" | "viewer" | "commenter",
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DocumentEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user } = useAuth()

  const [document, setDocument] = useState<DocumentItem | null>(null)
  const [title, setTitle] = useState("")
  const [vectorClock, setVectorClock] = useState<VectorClock>({})
  const [currentClock, setCurrentClock] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isStarred, setIsStarred] = useState(false)
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [onlineUsers, setOnlineUsers] = useState<any[]>([])
  const [userRole, setUserRole] = useState<string | null>(null)
  const [remoteCursors, setRemoteCursors] = useState<Cursor[]>([])

  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const socketRef = useRef<WebSocket | null>(null)

  const handleRemoteEditRef = useRef<(ops: Operation[], remoteUserId?: string) => void>(() => { })
  // const handleRenderCursorRef = useRef<(cursors: Cursor[]) => void>(() => { })

  // ── Fetch document ────────────────────────────────────────────────────────
  const fetchDocument = useCallback(async () => {
    if (!user?.id) return
    setIsLoading(true)
    try {
      const res = await getDocumentApi(id, user.id)
      if (res.success && res.document) {
        setDocument(res.document)
        setTitle(res.document.title ?? "")
        setVectorClock(res.document.global_v_clock ?? {})
        setCurrentClock(Math.max(...Object.values(res.document.global_v_clock ?? {}), 0))
      }
    } catch (err) {
      toast.error("Không tìm thấy tài liệu hoặc bạn không có quyền truy cập")
      router.push("/dashboard")
      console.error("Lỗi tải tài liệu:", err)
    } finally {
      setIsLoading(false)
    }
  }, [id, router, user?.id])

  useEffect(() => {
    if (user?.id) {
      fetchDocument()
    }
  }, [fetchDocument, user?.id])

  useEffect(() => {
    if (document && user) {
      const collab = document.collaborators?.find(c => c._id === user.id)
      setUserRole(collab ? collab.role : null)
    }
  }, [document, user])

  useEffect(() => {
    if (!document?._id || !user) return

    const currentUserRole =
      document.collaborators?.find((collaborator) => collaborator._id === user.id)?.role ??
      "viewer"

    const apiBaseUrl = getApiBaseUrl().replace(/\/?api\/?$/, "")
    const wsBaseUrl = apiBaseUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:")
    const socket = new WebSocket(
      `${wsBaseUrl}/ws/${encodeURIComponent(id)}/${encodeURIComponent(user.id)}`
    )

    socketRef.current = socket

    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: "JOIN",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: currentUserRole,
        }
      }))
    }

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as {
          type?: string
          user_id?: string
          online_users?: any[]
          new_role?: string
          op?: Operation
          ops?: Operation[]
          v_clock?: VectorClock
          left?: number
          top?: number
          height?: number
          width?: number
          username?: string
          color?: string
        }

        if (!message.type) return

        console.log("Received WS message:", message)

        if (message.type === "ERROR") {
          // Server rejected join or other error
          const msg = (message as any).message || "Unauthorized"
          alert(msg)
          try {
            socket.close()
          } catch { }
          router.push("/dashboard")
          return
        }


        if (message.type === "JOIN") {
          if (message.user_id) {
            const v_clock = message.v_clock as VectorClock
            setOnlineUsers(message.online_users || [])
            if (Object.keys(v_clock).length > 0) {
              setVectorClock(v_clock)
              setCurrentClock(Math.max(...Object.values(v_clock), currentClock))
            }
          }
        }

        if (message.type === "ROLE_UPDATE") {
          if (message.user_id && message.new_role) {
            setDocument((prev: any) => {
              if (!prev) return prev
              const updatedCollabs = prev.collaborators?.map((c: any) =>
                c._id === message.user_id ? { ...c, role: message.new_role } : c
              )
              return { ...prev, collaborators: updatedCollabs }
            })
            if (message.user_id === user.id) {
              setUserRole(message.new_role)
              toast.info(`Vai trò của bạn đã được cập nhật thành ${message.new_role}`)
            }
          }
        }

        if (message.type === "CURSOR") {
          if (!user || message.user_id === user.id) {
            return
          }
          const { left, top, height, width, username, color } = message as { left?: number; top?: number; height?: number; width?: number; username?: string; color?: string }
          if (left === undefined || top === undefined || height === undefined || !username || !color) {
            return
          }
          setRemoteCursors((current) => {
            const others = current.filter(c => c.user_id !== message.user_id)
            const updated = [...others, { user_id: message.user_id!, username, color, left, top, height, width }]
            return updated
          }
          )
        }

        if (message.type === "EDIT") {
          const { op, ops, v_clock } = message as { op?: Operation; ops?: Operation[]; v_clock?: VectorClock }
          const editOps = ops ?? (op ? [op] : [])
          if (editOps.length === 0 || !v_clock) return
          setVectorClock(v_clock)
          setCurrentClock(Math.max(...Object.values(v_clock ?? {}), currentClock))
          try {
            handleRemoteEditRef.current?.(editOps, message.user_id)
          } catch (handlerErr) {
          }
        }

        if (message.type === "COLLABORATOR_REMOVED") {
          setDocument((prev: any) => {
            if (!prev) return prev
            const updatedCollabs = prev.collaborators?.filter((c: any) => c._id !== message.user_id)
            return { ...prev, collaborators: updatedCollabs }
          })
          if (message.user_id === user.id) {
            toast.error("Bạn đã bị xóa khỏi tài liệu này")
            try {
              socket.close()
            } catch { }
            router.push("/dashboard")
          }
          return
        }

        if (message.type === "LEAVE") {
          setOnlineUsers((current) => current.filter((u) => u.id !== message.user_id))
        }
      } catch (err) {
      }
    }

    socket.onerror = (err) => {
      console.error("WebSocket error:", err)
    }

    socket.onclose = () => {
      socketRef.current = null
    }

    return () => {
      try {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "LEAVE" }))
        }
      } catch {
        // ignore close-time send failures
      }

      socket.close()
      socketRef.current = null
    }
  }, [document?._id, user?.id, id, router])

  // ── Auto-save title (debounce 800ms) ─────────────────────────────────────
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle)
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current)
    titleDebounceRef.current = setTimeout(async () => {
      try {
        await updateDocumentTitleApi(id, newTitle)
        setLastSaved(new Date())
      } catch (err) {
        console.error("Lỗi lưu tiêu đề:", err)
      }
    }, 800)
  }

  // ── Xóa tài liệu ─────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!window.confirm("Bạn có chắc muốn xóa tài liệu này?")) return
    try {
      await deleteDocumentApi(id)
      router.push("/dashboard")
    } catch (err) {
      console.error("Lỗi xóa tài liệu:", err)
    }
  }

  // ── Cập nhật collaborators sau thao tác chia sẻ ──────────────────────────
  const handleCollaboratorsChange = (updated: Collaborator[]) => {
    setDocument((prev) => prev ? { ...prev, collaborators: updated } : prev)
  }

  const isOwner = Boolean(user && document && user.id === document.ownerId)

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!document) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-medium">Không tìm thấy tài liệu</h2>
          <Button className="mt-4" asChild>
            <Link href="/dashboard">Về trang chủ</Link>
          </Button>
        </div>
      </div>
    )
  }

  const collaborators = document.collaborators ?? []
  const sidebarUsers = collaborators.map((collaborator, index) =>
    toSidebarUser(collaborator, onlineUsers.find((u) => u.id === collaborator._id)?.color || "", index, onlineUsers.some((u) => u.id === collaborator._id))
  )

  const savedLabel = lastSaved
    ? `Đã lưu ${lastSaved.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`
    : "Đang lưu..."

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <FileText className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="flex flex-col">
                <Input
                  disabled={userRole === "viewer" || userRole === "commenter"}
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="h-7 px-2 text-base font-medium bg-transparent border-transparent hover:border-border focus:border-primary w-auto min-w-50"
                />
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-2">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {savedLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Online Users Avatars */}
            <div className="flex items-center -space-x-2 mr-2">
              {onlineUsers.slice(0, 3).map((u, i) => (
                <div
                  key={u.id}
                  className="w-8 h-8 rounded-full border-2 border-background flex items-center justify-center text-xs font-medium text-white"
                  style={{ backgroundColor: u.color }}
                  title={u.username}
                >
                  {u.username.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                </div>
              ))}
              {onlineUsers.length > 3 && (
                <div className="w-8 h-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                  +{onlineUsers.length - 3}
                </div>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsStarred(!isStarred)}
              className={isStarred ? "text-owner" : ""}
            >
              <Star className={`w-5 h-5 ${isStarred ? "fill-owner" : ""}`} />
            </Button>

            <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Share2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Chia sẻ</span>
                </Button>
              </DialogTrigger>
              <ShareDialog
                socket={socketRef.current}
                docId={id}
                collaborators={collaborators}
                onCollaboratorsChange={handleCollaboratorsChange}
                onClose={() => setIsShareDialogOpen(false)}
                isOwner={isOwner}
                currentUserId={user?.id}
              />
            </Dialog>


            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <History className="w-4 h-4 mr-2" />
                  Lịch sử phiên bản
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Download className="w-4 h-4 mr-2" />
                  Tải xuống
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive cursor-pointer" onClick={handleDelete}>
                  Xóa tài liệu
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-4 py-2 border-t border-border overflow-x-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8"><Undo className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8"><Redo className="w-4 h-4" /></Button>
          <div className="w-px h-6 bg-border mx-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1">
                <span>Paragraph</span>
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Paragraph</DropdownMenuItem>
              <DropdownMenuItem>Heading 1</DropdownMenuItem>
              <DropdownMenuItem>Heading 2</DropdownMenuItem>
              <DropdownMenuItem>Heading 3</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="icon" className="h-8 w-8"><Bold className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8"><Italic className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8"><Underline className="w-4 h-4" /></Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="icon" className="h-8 w-8"><List className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8"><ListOrdered className="w-4 h-4" /></Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="icon" className="h-8 w-8"><AlignLeft className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8"><AlignCenter className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8"><AlignRight className="w-4 h-4" /></Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="icon" className="h-8 w-8"><Link2 className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8"><Image className="w-4 h-4" /></Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="">
        {/* Editor */}
        <div className={`w-full overflow-auto p-2`}>
          <DocumentContentEditor
            remoteCursors={remoteCursors}
            editable={userRole ? userRole !== "viewer" : false}
            initialContent={document.content_snapshot ?? ""}
            socket={socketRef.current}
            currentClock={currentClock}
            setCurrentClock={setCurrentClock}
            vectorClock={vectorClock}
            setVectorClock={setVectorClock}
            handleRemoteEditRef={handleRemoteEditRef}
          />
        </div>
      </div>
    </div>
  )
}

