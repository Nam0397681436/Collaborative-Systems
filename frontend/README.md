<div align="center">
  <h1>🎨 Collaborative Systems - Frontend</h1>
  <p><strong>Next.js Real-time Collaborative Editor UI</strong></p>
  <p>
    Trải nghiệm soạn thảo văn bản mượt mà theo thời gian thực (Real-time), hệ thống phân quyền mạnh mẽ và giao diện hiện đại mượt mà chuẩn Glassmorphism.
  </p>
  
  [![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
  [![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
</div>

<hr />

## 📖 Mục Lục
- [🌟 Tính Năng Nổi Bật](#-tính-năng-nổi-bật)
- [💻 Stack Công Nghệ](#-stack-công-nghệ)
- [🚀 Hướng Dẫn Cài Đặt](#-hướng-dẫn-cài-đặt)
- [📂 Cấu Trúc Thư Mục](#-cấu-trúc-thư-mục)
- [🧠 Phân Tích Component Lõi](#-phân-tích-component-lõi)
- [👥 Contributors](#-contributors)

---

## 🌟 Tính Năng Nổi Bật

1.  **Trình Soạn Thảo Thời Gian Thực (Real-time Editor):** Bắt và truyền dẫn các thao tác cục bộ (Insert/Delete) ngay khi người dùng gõ phím. Đồng bộ hóa mượt mà với độ trễ cực thấp (Ultra-low Latency).
2.  **Con Trỏ Động (Live Floating Cursors):** Quan sát trực quan vị trí con trỏ chuột của những người dùng khác trong thời gian thực, với màu sắc và tên định danh riêng biệt giúp dễ dàng phối hợp làm việc.
3.  **Quản Lý Cộng Tác Viên (Presence Sidebar):** Danh sách trực quan hiển thị số lượng và trạng thái người dùng (Online/Offline) đang kết nối chung một phòng (Room).
4.  **Hộp Thoại Chia Sẻ & Phân Quyền (Share Dialog):** Tính năng tìm kiếm người dùng qua Email và linh hoạt cấp quyền (Owner, Editor, Viewer). Việc thu hồi hoặc điều chỉnh quyền hạn (Ví dụ: Giáng cấp từ Editor xuống Viewer) được áp dụng tức thì mà không cần tải lại trang.
5.  **Giao diện Dark/Light Mode Cao Cấp:** Ứng dụng phong cách thiết kế tối giản, hệ thống lưới UI sạch sẽ, sử dụng Shadcn/UI kết hợp hiệu ứng kính trong (Glassmorphism).

---

## 💻 Stack Công Nghệ

-   **Core Framework**: Next.js 16 (App Router) & React 19. Đón đầu các chuẩn web tối ưu nhất.
-   **Ngôn ngữ**: TypeScript bảo đảm hệ thống kiểu dữ liệu Type-safe chặt chẽ.
-   **Styling**: Tailwind CSS v4.0.
-   **UI Library**: Shadcn/UI (xây dựng dựa trên Radix UI Primitives), Lucide React (Bộ biểu tượng vector).
-   **Giao tiếp Mạng (Networking)**: Axios (Tự động đính kèm JWT Interceptors cho Protected Routes) và Native WebSockets.

---

## 🚀 Hướng Dẫn Cài Đặt

### Yêu cầu
- Máy tính đã cài đặt **Node.js (v18 trở lên)**.

### Các Bước Cài Đặt Khởi Chạy
1. **Cài đặt thư viện**
```bash
# Di chuyển vào thư mục frontend/
npm install
```

2. **Cấu hình môi trường**
Tạo file `.env` bằng cách sao chép từ file `.env.example` và thiết lập URL trỏ về Backend API:
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api
```

3. **Khởi chạy Development Server**
```bash
npm run dev
```
Trình duyệt sẽ tự động khả dụng hoặc bạn có thể truy cập vào địa chỉ: **[http://localhost:4000](http://localhost:4000)** (Hoặc cổng mặc định hiển thị trên Terminal của bạn).

---

## 📂 Cấu Trúc Thư Mục

```text
frontend/
├── app/                        # Kiến trúc Next.js App Router (Routing Lõi)
│   ├── (auth)/                 # Cụm trang Đăng nhập / Đăng ký (Route Groups)
│   ├── dashboard/              # Danh sách quản lý tài liệu cá nhân
│   ├── document/               # Màn hình làm việc chính (Editor & Sidebar cộng tác)
│   └── globals.css             # Định nghĩa Global Theme (CSS variables, phông chữ)
├── components/                 # Các khối thành phần tái sử dụng (Reusables)
│   ├── ui/                     # Shadcn UI Primitives (Button, Input, Dropdown...)
│   ├── collaborators-sidebar.tsx # Sidebar quản lý người dùng và trạng thái trực tuyến
│   ├── document-content-editor.tsx # Editor Canvas Core + WebSockets Engine
│   └── share-dialog.tsx        # Modal/Hộp thoại chia sẻ phân quyền
├── hooks/                      # Custom React hooks (Ví dụ: useDebounce, useAuth...)
└── lib/                        # Thư viện tiện ích dùng chung
    ├── api/                    # Service trừu tượng hóa các kết nối API bằng Axios
    ├── auth-context.tsx        # React Context quản lý Token/State đăng nhập toàn cục
    └── utils.ts                # Helper xử lý định dạng Class CSS (Tailwind merge)
```

---

## 🧠 Phân Tích Component Lõi: `document-content-editor.tsx`

Tệp tin `document-content-editor.tsx` đóng vai trò là "bộ não" kiểm soát trải nghiệm Client:
- **Khởi tạo WebSocket**: Mở kết nối bền bỉ tới Backend ngay khi người dùng truy cập vào phòng qua `doc_id`.
- **Xử lý Sự kiện (Event Listeners)**:
  - `init`: Kéo trạng thái nguyên thủy (Snapshot) ban đầu của tài liệu.
  - `operation`: Nhận sự kiện OT từ người khác, tự động áp dụng hàm biến đổi (Transform) nếu con trỏ của mình đang ở vị trí nhạy cảm để tránh xung đột dữ liệu.
  - `cursor_update`: Nhận tọa độ hoặc chỉ số văn bản để render và di chuyển "Floating Cursors" của đối tác trên màn hình.
  - `role_updated`: Sự kiện lắng nghe quyền. Tự động vô hiệu hóa bàn phím (Chuyển sang chế độ Read-only) ngay khi Server báo bị hạ quyền xuống Viewer.

---

## 👥 Contributors

Trải nghiệm mượt mà và giao diện cao cấp này được nhào nặn từ sự tâm huyết của đội ngũ phát triển:

<a href="https://github.com/Nam0397681436/Collaborative-Systems/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Nam0397681436/Collaborative-Systems" alt="Contributors list" />
</a>

<div align="center">
  <p>Được xây dựng với ❤️ bởi cộng đồng lập trình viên Việt Nam.</p>
</div>
