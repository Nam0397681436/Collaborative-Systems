"use client"

import { useState, use } from "react"
import Link from "next/link"
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
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import {
  FileText,
  ArrowLeft,
  Share2,
  MoreHorizontal,
  Star,
  Download,
  History,
  Users,
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
  X,
  Crown,
  Pencil,
  Eye,
  UserPlus,
  Check,
  Copy,
  Clock,
  MessageCircle,
} from "lucide-react"
import { CollaboratorsSidebar } from "@/components/collaborators-sidebar"

// Mock data for online users
const onlineUsers = [
  { id: "1", name: "Nguyễn Văn", email: "nguyen@example.com", color: "#10b981", isOnline: true, role: "owner" as const, cursorPosition: { x: 120, y: 180 } },
  { id: "2", name: "Trần Thị B", email: "tran@example.com", color: "#3b82f6", isOnline: true, role: "editor" as const, cursorPosition: { x: 300, y: 250 } },
  { id: "3", name: "Lê Minh C", email: "le@example.com", color: "#f59e0b", isOnline: true, role: "editor" as const, cursorPosition: { x: 450, y: 320 } },
  { id: "4", name: "Phạm Hà D", email: "pham@example.com", color: "#8b5cf6", isOnline: false, role: "viewer" as const },
]

// Mock document content
const initialContent = `# Báo cáo dự án Q1 2024

## Tổng quan

Đây là báo cáo tổng hợp về tiến độ dự án trong quý 1 năm 2024. Chúng ta đã đạt được nhiều mục tiêu quan trọng và cũng gặp phải một số thách thức cần giải quyết.

### Các thành tựu chính

1. **Hoàn thành giai đoạn thiết kế** - Đội ngũ đã hoàn thành việc thiết kế giao diện người dùng cho tất cả các module chính.

2. **Tích hợp API** - Đã tích hợp thành công 80% các API cần thiết với hệ thống backend.

3. **Kiểm thử ban đầu** - Hoàn thành kiểm thử đơn vị cho các component quan trọng.

### Các thách thức

- Cần tối ưu hiệu suất cho module xử lý dữ liệu lớn
- Đồng bộ hóa real-time cần được cải thiện
- Cần thêm nguồn lực cho việc kiểm thử

## Kế hoạch Q2 2024

Trong quý tiếp theo, chúng ta sẽ tập trung vào:

- Hoàn thiện tích hợp API còn lại
- Tối ưu hiệu suất hệ thống
- Triển khai kiểm thử toàn diện
- Chuẩn bị cho giai đoạn beta testing`

export default function DocumentEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const [title, setTitle] = useState("Báo cáo dự án Q1 2024")
  const [content, setContent] = useState(initialContent)
  const [isStarred, setIsStarred] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-7 px-2 text-base font-medium bg-transparent border-transparent hover:border-border focus:border-primary w-auto min-w-[200px]"
                />
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-2">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Đã lưu 2 phút trước
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Online Users Avatars */}
            <div className="flex items-center -space-x-2 mr-2">
              {onlineUsers.filter(u => u.isOnline).slice(0, 3).map((user) => (
                <div
                  key={user.id}
                  className="w-8 h-8 rounded-full border-2 border-background flex items-center justify-center text-xs font-medium text-white"
                  style={{ backgroundColor: user.color }}
                  title={user.name}
                >
                  {user.name.split(" ").map(n => n[0]).join("")}
                </div>
              ))}
              {onlineUsers.filter(u => u.isOnline).length > 3 && (
                <div className="w-8 h-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                  +{onlineUsers.filter(u => u.isOnline).length - 3}
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
              <ShareDialog onClose={() => setIsShareDialogOpen(false)} />
            </Dialog>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSidebar(!showSidebar)}
              className={showSidebar ? "bg-secondary" : ""}
            >
              <Users className="w-5 h-5" />
            </Button>

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
                <DropdownMenuItem className="text-destructive">
                  Xóa tài liệu
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-4 py-2 border-t border-border overflow-x-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Undo className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Redo className="w-4 h-4" />
          </Button>
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
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Bold className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Italic className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Underline className="w-4 h-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <List className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ListOrdered className="w-4 h-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <AlignLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <AlignCenter className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <AlignRight className="w-4 h-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Link2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Image className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Editor */}
        <main className="flex-1 overflow-auto">
          <div className="max-w-4xl mx-auto py-8 px-4 md:px-8">
            {/* Simulated Cursors */}
            <div className="relative">
              {onlineUsers.filter(u => u.isOnline && u.cursorPosition && u.id !== "1").map((user) => (
                <div
                  key={user.id}
                  className="absolute pointer-events-none z-10"
                  style={{
                    left: user.cursorPosition?.x,
                    top: user.cursorPosition?.y,
                  }}
                >
                  <div
                    className="w-0.5 h-5 rounded-full"
                    style={{ backgroundColor: user.color }}
                  />
                  <div
                    className="text-xs px-1.5 py-0.5 rounded text-white whitespace-nowrap -mt-0.5"
                    style={{ backgroundColor: user.color }}
                  >
                    {user.name.split(" ")[0]}
                  </div>
                </div>
              ))}
            </div>

            {/* Editor Content */}
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full min-h-[calc(100vh-200px)] bg-transparent text-foreground resize-none focus:outline-none font-mono text-sm leading-relaxed"
              placeholder="Bắt đầu viết..."
            />
          </div>
        </main>

        {/* Collaborators Sidebar */}
        {showSidebar && (
          <CollaboratorsSidebar
            users={onlineUsers}
            onClose={() => setShowSidebar(false)}
            onOpenShare={() => setIsShareDialogOpen(true)}
          />
        )}
      </div>
    </div>
  )
}

function ShareDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("editor")
  const [copied, setCopied] = useState(false)

  const collaborators = [
    { id: "1", name: "Nguyễn Văn", email: "nguyen@example.com", role: "owner" },
    { id: "2", name: "Trần Thị B", email: "tran@example.com", role: "editor" },
    { id: "3", name: "Lê Minh C", email: "le@example.com", role: "editor" },
    { id: "4", name: "Phạm Hà D", email: "pham@example.com", role: "viewer" },
  ]

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleAddCollaborator = () => {
    if (email) {
      // Add collaborator logic here
      setEmail("")
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Chia sẻ tài liệu</DialogTitle>
        <DialogDescription>
          Mời người khác cộng tác trên tài liệu này
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6 py-4">
        {/* Add People */}
        <div className="space-y-3">
          <Label>Thêm người</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Nhập email..."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1"
            />
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">
                  <div className="flex items-center gap-2">
                    <Pencil className="w-3 h-3" />
                    Editor
                  </div>
                </SelectItem>
                <SelectItem value="viewer">
                  <div className="flex items-center gap-2">
                    <Eye className="w-3 h-3" />
                    Viewer
                  </div>
                </SelectItem>
                <SelectItem value="commenter">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-3 h-3" />
                    Commenter
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleAddCollaborator}>
              <UserPlus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Current Collaborators */}
        <div className="space-y-3">
          <Label>Người có quyền truy cập</Label>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {collaborators.map((collab) => (
              <div
                key={collab.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-sm font-medium text-primary-foreground">
                    {collab.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground text-sm">{collab.name}</span>
                      {collab.role === "owner" && (
                        <Crown className="w-3 h-3 text-owner" />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{collab.email}</span>
                  </div>
                </div>
                {collab.role === "owner" ? (
                  <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">
                    Chủ sở hữu
                  </span>
                ) : (
                  <Select defaultValue={collab.role}>
                    <SelectTrigger className="w-[100px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="remove" className="text-destructive">
                        Xóa
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Copy Link */}
        <div className="space-y-3">
          <Label>Hoặc sao chép liên kết</Label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={typeof window !== "undefined" ? window.location.href : ""}
              className="flex-1 text-sm"
            />
            <Button variant="outline" onClick={handleCopyLink}>
              {copied ? (
                <Check className="w-4 h-4 text-primary" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </DialogContent>
  )
}
