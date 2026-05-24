# Collaborative Text Editor - Frontend Application

Giao diện người dùng (Frontend) được thiết kế hiện đại, mượt mà và trực quan, hỗ trợ soạn thảo văn bản cộng tác theo thời gian thực (Real-time Collaborative Editing). Ứng dụng tích hợp sâu với hệ thống Backend thông qua kết nối WebSocket và REST APIs để đồng bộ hóa phím gõ, con trỏ chuột và phân quyền tài liệu tức thời.

---

## 🎨 Tính Năng Giao Diện Nổi Bật

1.  **Trình Soạn Thảo Thời Gian Thực (Real-time Collaborative Editor)**:
    *   Đồng bộ nội dung gõ phím siêu tốc sử dụng giải thuật client-side Operational Transformation (OT) kết hợp nhận diện xung đột.
    *   Hiển thị con trỏ chuột động (Floating Cursors) của những người dùng khác kèm theo tên của họ khi đang di chuyển và chỉnh sửa tài liệu.
2.  **Quản Lý Cộng Tác Viên (Collaborators Sidebar)**:
    *   Xem danh sách những người đang trực tuyến (Online) và ngoại tuyến (Offline) trong tài liệu hiện hành.
    *   Mỗi cộng tác viên được cấp một màu sắc đặc trưng để dễ dàng nhận biết trên văn bản.
3.  **Chia Sẻ & Phân Quyền (Share Dialog)**:
    *   Chủ sở hữu (Owner) tài liệu có thể thêm người khác bằng Email.
    *   Hỗ trợ phân quyền linh hoạt: **Chủ sở hữu (Owner)**, **Biên tập viên (Editor - có quyền gõ)**, **Người xem (Viewer - chỉ đọc)**.
    *   Thay đổi quyền hạn hoặc thu hồi quyền truy cập trực tiếp từ Sidebar và có hiệu lực ngay lập tức thông qua WebSocket.
4.  **Hệ Thống Xác Thực (Authentication Flow)**:
    *   Đăng ký tài khoản, đăng nhập bằng JWT Token.
    *   Tự động bảo vệ các tuyến đường (Protected Routes) thông qua React Context và điều hướng thông minh.
5.  **Chế Độ Sáng/Tối (Dark/Light Mode)**:
    *   Hỗ trợ đổi giao diện linh hoạt với lớp nền kính mịn (Glassmorphism), màu sắc tối giản sang trọng theo chuẩn thiết kế hiện đại.

---

## 🛠️ Công Nghệ Sử Dụng (Tech Stack)

*   **Framework**: [Next.js 16 (App Router)](https://nextjs.org/) chạy trên **React 19** và **TypeScript**.
*   **Styling**: [Tailwind CSS v4.0](https://tailwindcss.com/) cho tốc độ biên dịch cực nhanh kết hợp biến CSS (`globals.css`) để cấu hình hệ màu sắc chuyên nghiệp.
*   **UI Components**: [Shadcn/UI](https://ui.shadcn.com/) (xây dựng dựa trên [Radix UI](https://www.radix-ui.com/) primitives) giúp giao diện đạt chuẩn accessibility cao và tương tác tối ưu.
*   **Icons**: [Lucide React](https://lucide.dev/) mang lại bộ vector icon hiện đại, tối giản.
*   **HTTP Client**: [Axios](https://axios-http.com/) được cấu hình interceptor để tự động chèn JWT token vào header cho các yêu cầu API.
*   **Real-time Communication**: Native **WebSockets** quản lý kết nối hai chiều bền bỉ, nhận và phát tín hiệu OT nhanh chóng.

---

## 📂 Cấu Trúc Thư Mục

```text
frontend/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # Cụm trang xác thực (Đăng nhập / Đăng ký)
│   │   ├── login/
│   │   └── register/
│   ├── dashboard/              # Trang cá nhân quản lý danh sách tài liệu
│   ├── document/               # Trang soạn thảo chi tiết (Chứa Editor Canvas)
│   ├── globals.css             # Định nghĩa font chữ, CSS variables và Tailwind base
│   ├── layout.tsx              # Root Layout quản lý Theme & Auth Provider
│   └── page.tsx                # Trang gốc điều hướng (Root Redirect)
│
├── components/                 # Các thành phần giao diện tái sử dụng
│   ├── ui/                     # Shadcn UI primitives (Button, Input, Dialog, Select...)
│   ├── collaborators-sidebar.tsx  # Sidebar hiển thị cộng tác viên và phân quyền
│   ├── document-content-editor.tsx # Trình soạn thảo văn bản và WebSocket Engine
│   ├── share-dialog.tsx        # Hộp thoại tìm kiếm và thêm cộng tác viên
│   └── theme-provider.tsx      # Quản lý cấu hình sáng/tối (Dark/Light mode)
│
├── hooks/                      # Custom hooks tái sử dụng
│
├── lib/                        # Thư viện dùng chung
│   ├── api/                    # Service định nghĩa các API auth, document CRUD
│   ├── auth-context.tsx        # Context quản lý trạng thái đăng nhập toàn ứng dụng
│   └── utils.ts                # Hàm bổ trợ định dạng CSS (cn helper)
│
├── public/                     # Thư mục chứa tài nguyên tĩnh (Static assets)
├── tailwind.config.ts          # Cấu hình Tailwind (nếu có)
├── tsconfig.json               # Cấu hình TypeScript compiler
└── package.json                # Danh sách dependencies & CLI scripts
```

---

## 🚀 Cài Đặt và Khởi Chạy

### Yêu Cầu Hệ Thống
*   Đã cài đặt **Node.js (v18 trở lên)**.
*   Trình quản lý gói **npm** (đã đi kèm Node.js) hoặc **pnpm** (khuyên dùng).

### Bước 1: Cài đặt thư viện phụ thuộc
Di chuyển vào thư mục `frontend` và cài đặt:
```bash
npm install
# hoặc sử dụng pnpm
pnpm install
```

### Bước 2: Cấu hình biến môi trường
Tạo file `.env` tại thư mục `frontend/` (sao chép từ `.env.example`):
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api
```
*Lưu ý: Nếu Backend của bạn đang chạy ở cổng hoặc IP khác, hãy thay đổi URL cho phù hợp.*

### Bước 3: Khởi chạy chế độ phát triển (Development Server)
```bash
npm run dev
```
Ứng dụng sẽ hoạt động tại địa chỉ: **[http://localhost:4000](http://localhost:4000)** (Mở trình duyệt và truy cập để trải nghiệm).

### Bước 4: Đóng gói sản phẩm (Production Build)
Khi cần triển khai thực tế trên môi trường Production, hãy chạy:
```bash
# Biên dịch mã nguồn tối ưu
npm run build

# Khởi chạy server production
npm run start
```

---

## 🧠 Phân Tích Component Lõi: `document-content-editor.tsx`

Tệp tin [document-content-editor.tsx](file:///d:/Semester/Ky_8/HTPT/Collaborative-Systems/frontend/components/document-content-editor.tsx) chứa toàn bộ linh hồn hoạt động của Frontend. Đây là nơi thực hiện:
*   **Khởi tạo Socket**: Khi component mount và User được xác thực, nó sẽ mở kết nối `new WebSocket(...)` tới backend bằng `doc_id`.
*   **Lắng nghe Sự kiện (Socket Listeners)**:
    *   `init`: Nhận toàn bộ nội dung tài liệu ban đầu từ database và thiết lập trạng thái editor.
    *   `operation`: Nhận các thao tác từ người dùng khác, đưa qua bộ biến đổi chỉ số OT để cập nhật chính xác vị trí con trỏ của mình và hiển thị chữ mới.
    *   `cursor_update`: Nhận vị trí con trỏ chuột hiện tại của mọi người dùng trực tuyến và hiển thị các "Cursor Flag" nhấp nháy trên màn hình.
    *   `role_updated`: Tự động thay đổi chế độ soạn thảo (từ Soạn thảo sang Chỉ xem hoặc ngược lại) ngay khi bị thay đổi phân quyền bởi Owner.
*   **Bắt Sự kiện Bàn Phím (Input Capture)**: Theo dõi chuyển động gõ của bàn phím và biên dịch chúng thành các mảng thao tác `[ { "type": "insert", "text": "a", "position": 10 } ]` và đẩy lên server kèm thông tin vector clock để kiểm tra thứ tự nhân quả.
