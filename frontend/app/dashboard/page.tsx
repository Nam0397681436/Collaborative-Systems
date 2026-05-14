"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
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
} from "lucide-react"

// Mock data
const documents = [
  {
    id: "1",
    title: "Báo cáo dự án Q1 2024",
    updatedAt: "2 giờ trước",
    collaborators: 3,
    isStarred: true,
    preview: "Tổng quan về tiến độ dự án trong quý 1...",
  },
  {
    id: "2",
    title: "Kế hoạch Marketing 2024",
    updatedAt: "5 giờ trước",
    collaborators: 5,
    isStarred: false,
    preview: "Chiến lược marketing đa kênh cho năm...",
  },
  {
    id: "3",
    title: "Hướng dẫn sử dụng hệ thống",
    updatedAt: "1 ngày trước",
    collaborators: 2,
    isStarred: true,
    preview: "Tài liệu hướng dẫn chi tiết cách sử dụng...",
  },
  {
    id: "4",
    title: "Meeting Notes - Sprint Review",
    updatedAt: "2 ngày trước",
    collaborators: 8,
    isStarred: false,
    preview: "Ghi chú cuộc họp đánh giá sprint...",
  },
  {
    id: "5",
    title: "Đề xuất ngân sách",
    updatedAt: "3 ngày trước",
    collaborators: 2,
    isStarred: false,
    preview: "Đề xuất phân bổ ngân sách cho các...",
  },
  {
    id: "6",
    title: "Tài liệu API Documentation",
    updatedAt: "1 tuần trước",
    collaborators: 4,
    isStarred: true,
    preview: "Chi tiết các endpoint API của hệ thống...",
  },
]

export default function DashboardPage() {
  const router = useRouter()
  const { user, isLoading, logout } = useAuth()
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [filter, setFilter] = useState<"all" | "starred" | "shared">("all")

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login")
    }
  }, [user, isLoading, router])

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
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter =
      filter === "all" ||
      (filter === "starred" && doc.isStarred) ||
      (filter === "shared" && doc.collaborators > 1)
    return matchesSearch && matchesFilter
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
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-sm font-medium text-primary-foreground">{user.avatar}</span>
                </div>
                <span className="hidden md:inline text-foreground">{user.name}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem>
                <Settings className="w-4 h-4 mr-2" />
                Cài đặt
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
          <Button className="w-full justify-start gap-2 mb-4" asChild>
            <Link href="/document/new">
              <Plus className="w-4 h-4" />
              Tạo tài liệu mới
            </Link>
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
          <Button className="w-full mb-4 md:hidden" asChild>
            <Link href="/document/new">
              <Plus className="w-4 h-4 mr-2" />
              Tạo tài liệu mới
            </Link>
          </Button>

          {/* Documents Grid/List */}
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredDocuments.map((doc) => (
                <DocumentCard key={doc.id} document={doc} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredDocuments.map((doc) => (
                <DocumentListItem key={doc.id} document={doc} />
              ))}
            </div>
          )}

          {filteredDocuments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground">Không tìm thấy tài liệu</h3>
              <p className="text-muted-foreground mt-2">Thử thay đổi bộ lọc hoặc tạo tài liệu mới</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function DocumentCard({ document }: { document: typeof documents[0] }) {
  return (
    <Link href={`/document/${document.id}`}>
      <div className="group relative bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors cursor-pointer">
        {/* Preview */}
        <div className="h-32 bg-secondary rounded-md mb-4 flex items-center justify-center">
          <FileText className="w-12 h-12 text-muted-foreground" />
        </div>

        {/* Title */}
        <h3 className="font-medium text-foreground truncate mb-2">{document.title}</h3>

        {/* Meta */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{document.updatedAt}</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            <span>{document.collaborators}</span>
          </div>
        </div>

        {/* Star */}
        {document.isStarred && (
          <Star className="absolute top-3 right-3 w-4 h-4 text-owner fill-owner" />
        )}

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
            <DropdownMenuItem>
              <Share2 className="w-4 h-4 mr-2" />
              Chia sẻ
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Star className="w-4 h-4 mr-2" />
              {document.isStarred ? "Bỏ gắn sao" : "Gắn sao"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="w-4 h-4 mr-2" />
              Xóa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Link>
  )
}

function DocumentListItem({ document }: { document: typeof documents[0] }) {
  return (
    <Link href={`/document/${document.id}`}>
      <div className="group flex items-center gap-4 bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors cursor-pointer">
        <div className="w-10 h-10 bg-secondary rounded-md flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-muted-foreground" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-foreground truncate">{document.title}</h3>
            {document.isStarred && <Star className="w-4 h-4 text-owner fill-owner flex-shrink-0" />}
          </div>
          <p className="text-sm text-muted-foreground truncate">{document.preview}</p>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-shrink-0">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span className="hidden sm:inline">{document.updatedAt}</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            <span>{document.collaborators}</span>
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
            <DropdownMenuItem>
              <Share2 className="w-4 h-4 mr-2" />
              Chia sẻ
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Star className="w-4 h-4 mr-2" />
              {document.isStarred ? "Bỏ gắn sao" : "Gắn sao"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="w-4 h-4 mr-2" />
              Xóa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Link>
  )
}
