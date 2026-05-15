// ── Share Dialog ──────────────────────────────────────────────────────────────

import { Collaborator, DocumentRole } from "@/lib/api/documents"
import { DialogContent } from "./ui/dialog"
import { DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog"
import { Input } from "./ui/input"
import { Button } from "./ui/button"
import { useState } from "react"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select"
import { Label } from "./ui/label"
import { UserPlus, Loader2, Check, Copy, Pencil, Eye, MessageSquare, Crown } from "lucide-react"
import { addCollaboratorApi, removeCollaboratorApi, updateCollaboratorRoleApi } from "@/lib/api/documents"


interface ShareDialogProps {
    docId: string
    collaborators: Collaborator[]
    onCollaboratorsChange: (updated: Collaborator[]) => void
    onClose: () => void
    isOwner?: boolean
    currentUserId?: string | null
    socket: WebSocket | null
}

export default function ShareDialog({ docId, collaborators, onCollaboratorsChange, onClose, isOwner = false, currentUserId = null, socket }: ShareDialogProps) {
    const [email, setEmail] = useState("")
    const [role, setRole] = useState<DocumentRole>("editor")
    const [copied, setCopied] = useState(false)
    const [isAdding, setIsAdding] = useState(false)
    const [error, setError] = useState("")

    const normalizeRole = (value: string) => (value === "commenter" ? "viewer" : value)

    const handleCopyLink = () => {
        navigator.clipboard.writeText(window.location.href)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleAddCollaborator = async () => {
        if (!email.trim()) return
        setIsAdding(true)
        setError("")
        try {
            const res = await addCollaboratorApi(docId, email.trim(), role, currentUserId ?? undefined)
            if (res.success && res.document) {
                onCollaboratorsChange(res.document.collaborators ?? [])
                setEmail("")
            } else {
                setError(res.message ?? "Không thể thêm cộng tác viên")
            }
        } catch (err: unknown) {
            const e = err as { message?: string }
            setError(e?.message ?? "Đã xảy ra lỗi")
        } finally {
            setIsAdding(false)
        }
    }

    const handleRoleChange = async (collaboratorId: string, newRole: string) => {
        if (!isOwner) {
            setError("Chỉ chủ sở hữu mới có thể thay đổi vai trò")
            return
        }
        if (newRole === "remove") {
            try {
                const res = await removeCollaboratorApi(docId, collaboratorId, currentUserId ?? undefined)
                if (res.success && res.document) {
                    onCollaboratorsChange(res.document.collaborators ?? [])
                    if (socket) {
                        socket.send(JSON.stringify({
                            type: "collaborator_removed",
                            user_id: collaboratorId,
                        }))
                    }
                }
            } catch (err) {
                console.error("Lỗi xóa cộng tác viên:", err)
            }
            return
        }
        try {
            const res = await updateCollaboratorRoleApi(docId, collaboratorId, newRole as DocumentRole, currentUserId ?? undefined)
            if (res.success && res.document) {
                onCollaboratorsChange(res.document.collaborators ?? [])
            }
        } catch (err) {
            console.error("Lỗi đổi role:", err)
        }
    }

    return (
        <DialogContent className="sm:max-w-lg">
            <DialogHeader>
                <DialogTitle>Chia sẻ tài liệu</DialogTitle>
                <DialogDescription>Mời người khác cộng tác trên tài liệu này</DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
                {/* Add People */}
                <div className="space-y-3">
                    <Label>Thêm người</Label>
                    <div className="flex gap-2">
                        <Input
                            placeholder="Nhập email..."
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); setError("") }}
                            onKeyDown={(e) => { if (e.key === "Enter") handleAddCollaborator() }}
                            className="flex-1"
                        />
                        <Select value={role} onValueChange={(v) => setRole(v as DocumentRole)}>
                            <SelectTrigger className="w-30">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="editor">
                                    <div className="flex items-center gap-2"><Pencil className="w-3 h-3" />Editor</div>
                                </SelectItem>
                                <SelectItem value="viewer">
                                    <div className="flex items-center gap-2"><Eye className="w-3 h-3" />Viewer</div>
                                </SelectItem>
                                <SelectItem value="commenter">
                                    <div className="flex items-center gap-2"><MessageSquare className="w-3 h-3" />Commenter</div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        <Button onClick={handleAddCollaborator} disabled={isAdding || !email.trim()}>
                            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                        </Button>
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                {/* Current Collaborators */}
                <div className="space-y-3">
                    <Label>Người có quyền truy cập</Label>
                    <div className="space-y-2 max-h-50 overflow-y-auto">
                        {collaborators.map((collab) => (
                            <div key={collab._id} className="flex items-center justify-between p-3 rounded-lg bg-secondary">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-sm font-medium text-primary-foreground">
                                        {(collab.username ?? collab.email ?? "?").slice(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-foreground text-sm">{collab.username ?? collab.email}</span>
                                            {collab.role === "owner" && <Crown className="w-3 h-3 text-owner" />}
                                        </div>
                                        <span className="text-xs text-muted-foreground">{collab.email}</span>
                                    </div>
                                </div>
                                {collab.role === "owner" ? (
                                    <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">Chủ sở hữu</span>
                                ) : isOwner ? (
                                    <Select value={normalizeRole(collab.role)} onValueChange={(v) => handleRoleChange(collab._id, v)}>
                                        <SelectTrigger className="w-25 h-8 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="editor">Editor</SelectItem>
                                            <SelectItem value="viewer">Viewer</SelectItem>
                                            <SelectItem value="remove" className="text-destructive">Xóa</SelectItem>
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">{collab.role}</span>
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
                            {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                        </Button>
                    </div>
                </div>
            </div>
        </DialogContent>
    )
}
