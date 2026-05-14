"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth-context"
import { FileText, Eye, EyeOff, Check } from "lucide-react"

export default function RegisterPage() {
  const router = useRouter()
  const { user, login } = useAuth()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (user) router.replace("/dashboard")
  }, [user, router])


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) return
    setIsLoading(true)
    await login(email, password)
    setIsLoading(false)
    router.push("/dashboard")
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold text-foreground">CollabDocs</span>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-foreground">Tạo tài khoản mới</h1>
            <p className="text-muted-foreground mt-2">Bắt đầu cộng tác với đội ngũ của bạn</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Họ và tên</Label>
              <Input
                id="name"
                type="text"
                placeholder="Nguyễn Văn A"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-12 bg-card border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 bg-card border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12 bg-card border-border pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Xác nhận mật khẩu</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="h-12 bg-card border-border pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-sm text-destructive">Mật khẩu không khớp</p>
              )}
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 text-base font-medium"
            disabled={isLoading || password !== confirmPassword}
          >
            {isLoading ? "Đang tạo tài khoản..." : "Đăng ký"}
          </Button>
        </form>

        {/* Login Link */}
        <p className="text-center text-muted-foreground">
          Đã có tài khoản?{" "}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  )
}
