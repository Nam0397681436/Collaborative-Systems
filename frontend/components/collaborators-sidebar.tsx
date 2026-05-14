"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  X,
  Crown,
  Pencil,
  Eye,
  UserPlus,
  Circle,
  Search,
} from "lucide-react"

type UserRole = "owner" | "editor" | "viewer"

interface User {
  id: string
  name: string
  email: string
  color: string
  isOnline: boolean
  role: UserRole
  cursorPosition?: { x: number; y: number }
}

interface CollaboratorsSidebarProps {
  users: User[]
  onClose: () => void
  onOpenShare: () => void
}

export function CollaboratorsSidebar({ users, onClose, onOpenShare }: CollaboratorsSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const onlineUsers = users.filter((u) => u.isOnline)
  const offlineUsers = users.filter((u) => !u.isOnline)

  const filteredOnlineUsers = onlineUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredOfflineUsers = offlineUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case "owner":
        return <Crown className="w-3 h-3 text-owner" />
      case "editor":
        return <Pencil className="w-3 h-3 text-editor" />
      case "viewer":
        return <Eye className="w-3 h-3 text-viewer" />
    }
  }

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case "owner":
        return "Chủ sở hữu"
      case "editor":
        return "Biên tập viên"
      case "viewer":
        return "Người xem"
    }
  }

  return (
    <aside className="w-72 border-l border-border bg-card flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-semibold text-foreground">Người cộng tác</h3>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Tìm kiếm..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-secondary"
          />
        </div>
      </div>

      {/* Users List */}
      <div className="flex-1 overflow-y-auto">
        {/* Online Users */}
        <div className="p-3">
          <div className="flex items-center gap-2 mb-3">
            <Circle className="w-2 h-2 fill-online text-online" />
            <span className="text-sm font-medium text-foreground">
              Đang online ({filteredOnlineUsers.length})
            </span>
          </div>
          <div className="space-y-1">
            {filteredOnlineUsers.map((user) => (
              <UserItem key={user.id} user={user} getRoleIcon={getRoleIcon} getRoleLabel={getRoleLabel} />
            ))}
          </div>
        </div>

        {/* Offline Users */}
        {filteredOfflineUsers.length > 0 && (
          <div className="p-3 border-t border-border">
            <div className="flex items-center gap-2 mb-3">
              <Circle className="w-2 h-2 fill-muted-foreground text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                Offline ({filteredOfflineUsers.length})
              </span>
            </div>
            <div className="space-y-1">
              {filteredOfflineUsers.map((user) => (
                <UserItem key={user.id} user={user} getRoleIcon={getRoleIcon} getRoleLabel={getRoleLabel} isOffline />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add People Button */}
      <div className="p-3 border-t border-border">
        <Button variant="outline" className="w-full gap-2" onClick={onOpenShare}>
          <UserPlus className="w-4 h-4" />
          Thêm người cộng tác
        </Button>
      </div>
    </aside>
  )
}

interface UserItemProps {
  user: User
  getRoleIcon: (role: UserRole) => JSX.Element
  getRoleLabel: (role: UserRole) => string
  isOffline?: boolean
}

function UserItem({ user, getRoleIcon, getRoleLabel, isOffline }: UserItemProps) {
  return (
    <div className={`flex items-center justify-between p-2 rounded-lg hover:bg-secondary group ${isOffline ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="relative">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium text-white"
            style={{ backgroundColor: user.color }}
          >
            {user.name.split(" ").map((n) => n[0]).join("")}
          </div>
          {!isOffline && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-online border-2 border-card" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm text-foreground truncate">{user.name}</span>
            {getRoleIcon(user.role)}
          </div>
          <span className="text-xs text-muted-foreground truncate block">{getRoleLabel(user.role)}</span>
        </div>
      </div>
      
      {user.role !== "owner" && (
        <Select defaultValue={user.role}>
          <SelectTrigger className="w-[90px] h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
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
  )
}
