"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import {
  getUserDocumentsApi,
  getSharedDocumentsApi,
  createDocumentApi,
  deleteDocumentApi,
  type DocumentItem,
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
  FileText,
  Plus,
  Search,
  Grid3X3,
  List,
  MoreHorizontal,
  Star,
  Trash2,
  Share2,
  Clock,
  Users,
  FolderOpen,
  Settings,
  LogOut,
  ChevronDown,
  Loader2,
} from "lucide-react"

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso?: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diff < 60) return "Vừa xong"
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`
  if (diff < 604800) return `${Math.floor(diff / 86400)} ngày trước`
  return d.toLocaleDateString("vi-VN")
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const { user, isLoading, logout } = useAuth()
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [isLoadingDocs, setIsLoadingDocs] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [filter, setFilter] = useState<"all" | "starred" | "shared">("all")

  // ── Redirect nếu chưa đăng nhập ──
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login")
    }
  }, [user, isLoading, router])

  // ── Fetch documents ───────────────────────────────────────────────────────
  const fetchDocuments = useCallback(async () => {
    if (!user) return
    setIsLoadingDocs(true)
    try {
      const res =
        filter === "shared"
          ? await getSharedDocumentsApi(user.id)
          : await getUserDocumentsApi(user.id)
      setDocuments(res.documents ?? [])
    } catch (err) {
      console.error("Lỗi tải tài liệu:", err)
    } finally {
      setIsLoadingDocs(false)
    }
  }, [user, filter])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  // ── Tạo tài liệu mới ──────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!user || isCreating) return
    setIsCreating(true)
    try {
      const res = await createDocumentApi(user.id)
      if (res.success && res.document?._id) {
        router.push(`/document/${res.document._id}`)
      }
    } catch (err) {
      console.error("Lỗi tạo tài liệu:", err)
    } finally {
      setIsCreating(false)
    }
  }

  // ── Xóa tài liệu ─────────────────────────────────────────────────────────
  const handleDelete = async (docId: string) => {
    try {
      await deleteDocumentApi(docId, user?.id ?? "")
      setDocuments((prev) => prev.filter((d) => d._id !== docId))
    } catch (err) {
      console.error("Lỗi xóa tài liệu:", err)
    }
  }

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary animate-pulse" />
          <p className="text-sm text-muted-foreground">Đang tải...</p>
        </div>
      </div>
    )
  }

  const filteredDocuments = documents.filter((doc) => {
    const title = doc.title ?? ""
    return title.toLowerCase().includes(searchQuery.toLowerCase())
  })

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-foreground hidden sm:inline">CollabDocs</span>
            </Link>
          </div>

          {/* Search */}
          <div className="flex-1 max-w-xl mx-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm tài liệu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-secondary border-border h-10"
              />
            </div>
          </div>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild className="flex items-center p-2">
              <Button variant="ghost" className="flex items-center gap-2 p-2">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-sm font-medium text-primary-foreground">{user.avatar}</span>
                </div>
                <span className="hidden md:inline text-foreground">{user.username}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive cursor-pointer"
                onClick={() => { logout(); router.push("/login") }}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Đăng xuất
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-64 border-r border-border min-h-[calc(100vh-4rem)] p-4 gap-2">
          <Button
            className="w-full justify-start gap-2 mb-4"
            onClick={handleCreate}
            disabled={isCreating}
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Tạo tài liệu mới
          </Button>

          <nav className="space-y-1">
            <Button
              variant={filter === "all" ? "secondary" : "ghost"}
              className="w-full justify-start gap-2"
              onClick={() => setFilter("all")}
            >
              <FolderOpen className="w-4 h-4" />
              Tất cả tài liệu
            </Button>
            <Button
              variant={filter === "starred" ? "secondary" : "ghost"}
              className="w-full justify-start gap-2"
              onClick={() => setFilter("starred")}
            >
              <Star className="w-4 h-4" />
              Đã gắn sao
            </Button>
            <Button
              variant={filter === "shared" ? "secondary" : "ghost"}
              className="w-full justify-start gap-2"
              onClick={() => setFilter("shared")}
            >
              <Users className="w-4 h-4" />
              Chia sẻ với tôi
            </Button>
          </nav>

          <div className="mt-auto pt-4 border-t border-border">
            <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground">
              <Trash2 className="w-4 h-4" />
              Thùng rác
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6">
          {/* Actions */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">
                {filter === "all" && "Tất cả tài liệu"}
                {filter === "starred" && "Tài liệu gắn sao"}
                {filter === "shared" && "Được chia sẻ"}
              </h1>
              <span className="text-muted-foreground text-sm">({filteredDocuments.length})</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("grid")}
              >
                <Grid3X3 className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("list")}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Mobile Create Button */}
          <Button className="w-full mb-4 md:hidden" onClick={handleCreate} disabled={isCreating}>
            {isCreating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Tạo tài liệu mới
          </Button>

          {/* Loading state */}
          {isLoadingDocs ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredDocuments.map((doc) => (
                <DocumentCard key={doc._id} document={doc} onDelete={handleDelete} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredDocuments.map((doc) => (
                <DocumentListItem key={doc._id} document={doc} onDelete={handleDelete} />
              ))}
            </div>
          )}

          {!isLoadingDocs && filteredDocuments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground">Không có tài liệu nào</h3>
              <p className="text-muted-foreground mt-2">Tạo tài liệu mới để bắt đầu cộng tác</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

// ── Document Card ─────────────────────────────────────────────────────────────

function DocumentCard({ document, onDelete }: { document: DocumentItem; onDelete: (id: string) => void }) {
  return (
    <div className="group relative bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors">
      <Link href={`/document/${document._id}`}>
        {/* Preview */}
        <div className="h-32 bg-secondary rounded-md mb-4 flex items-center justify-center">
          <FileText className="w-12 h-12 text-muted-foreground" />
        </div>

        {/* Title */}
        <h3 className="font-medium text-foreground truncate mb-2">
          {document.title || "Chưa có tiêu đề"}
        </h3>

        {/* Meta */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{formatDate(document.updated_at)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            <span>{document.collaborators?.length ?? 0}</span>
          </div>
        </div>
      </Link>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.preventDefault()}
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/document/${document._id}`}>
              <Share2 className="w-4 h-4 mr-2" />
              Mở tài liệu
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive cursor-pointer"
            onClick={() => onDelete(document._id)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Xóa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ── Document List Item ────────────────────────────────────────────────────────

function DocumentListItem({ document, onDelete }: { document: DocumentItem; onDelete: (id: string) => void }) {
  return (
    <div className="group flex items-center gap-4 bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors">
      <Link href={`/document/${document._id}`} className="flex items-center gap-4 flex-1 min-w-0">
        <div className="w-10 h-10 bg-secondary rounded-md flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-muted-foreground" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-foreground truncate">
            {document.title || "Chưa có tiêu đề"}
          </h3>
        </div>
      </Link>

      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-shrink-0">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span className="hidden sm:inline">{formatDate(document.updated_at)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Users className="w-3 h-3" />
          <span>{document.collaborators?.length ?? 0}</span>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.preventDefault()}
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/document/${document._id}`}>
              <Share2 className="w-4 h-4 mr-2" />
              Mở tài liệu
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive cursor-pointer"
            onClick={() => onDelete(document._id)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Xóa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
