<div align="center">
  <h1>⚙️ Collaborative Systems - Backend</h1>
  <p><strong>Core Backend API & OT Worker Engine</strong></p>
  <p>
    Thành phần cốt lõi xử lý tính toán thuật toán Operational Transformation (OT), phân tán tải bằng Message Queue và quản lý kết nối WebSocket thời gian thực.
  </p>
  
  [![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org)
  [![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
  [![RabbitMQ](https://img.shields.io/badge/RabbitMQ-FF6600?style=flat&logo=rabbitmq&logoColor=white)](https://www.rabbitmq.com/)
  [![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=flat&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
  [![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white)](https://redis.io/)
</div>

<hr />

## 📖 Mục Lục
- [🌟 Tổng Quan Hệ Thống](#-tổng-quan-hệ-thống)
- [🏗️ Kiến Trúc Xử Lý](#-kiến-trúc-xử-lý)
- [💻 Stack Công Nghệ](#-stack-công-nghệ)
- [🚀 Hướng Dẫn Cài Đặt](#-hướng-dẫn-cài-đặt)
- [📂 Cấu Trúc Mã Nguồn](#-cấu-trúc-mã-nguồn)
- [🧪 Kiểm Thử (Testing)](#-kiểm-thử-testing)
- [👥 Contributors](#-contributors)

---

## 🌟 Tổng Quan Hệ Thống

Backend của **Collaborative Systems** được thiết kế chia làm hai tiến trình chạy song song nhằm đảm bảo khả năng mở rộng (Scalability) tối đa:
1.  **API Server (FastAPI)**: Quản lý toàn bộ RESTful APIs (Xác thực, Tạo/Sửa/Xóa Documents) và duy trì hàng ngàn kết nối WebSockets với các trình duyệt. Luồng này hoàn toàn phi trạng thái (Stateless) và không trực tiếp xử lý các phép tính OT nặng để tránh nghẽn Event Loop.
2.  **OT Worker Process**: Một Background Worker tiêu thụ thông điệp liên tục từ RabbitMQ. Nó chịu trách nhiệm chính trong việc thực thi thuật toán **Ma trận 3x3 Operational Transformation** và kiểm tra Vector Clock nhằm giải quyết xung đột (Conflict Resolution).

---

## 🏗️ Kiến Trúc Xử Lý

Mọi thao tác thay đổi (Operation) từ Frontend đều đi qua chu trình Event-Driven như sau:
1.  Nhận thao tác từ Client qua luồng **WebSocket** và ngay lập tức đẩy (Push) vào **RabbitMQ Exchange**.
2.  Định tuyến theo cơ chế **Consistent Hashing** (dựa vào `Document ID`) để đưa tác vụ vào hàng đợi chỉ định. Điều này đảm bảo mọi thao tác trên cùng một tài liệu luôn được xử lý **tuần tự** (Strict Ordering), loại bỏ hoàn toàn lỗi Race Condition.
3.  **OT Worker** kéo (Pull) tác vụ -> So khớp Vector Clock -> Chạy biến đổi ma trận OT (Nếu có tranh chấp/xung đột) -> Cập nhật Database bằng toán tử Atomic (`$inc` của MongoDB) và lưu trạng thái đệm cực nhanh trên Redis (LTRIM).
4.  Worker phát (Broadcast) kết quả thành công lên Exchange `broadcast_to_room`. API Server bắt tín hiệu nội bộ này và đẩy trực tiếp về lại cho Clients thông qua WebSockets.

---

## 💻 Stack Công Nghệ

-   **Core Framework**: FastAPI (AsyncIO) & Uvicorn.
-   **Database (NoSQL)**: MongoDB (Motor Async Driver).
-   **Message Broker**: RabbitMQ (aio-pika).
-   **In-Memory Cache**: Redis (redis.asyncio).
-   **Testing**: Pytest (Test-Driven Development cho logic OT).

---

## 🚀 Hướng Dẫn Cài Đặt

### 1. Khởi động Cơ sở hạ tầng (Docker)
```bash
# Tại thư mục backend/
docker-compose up -d
```
Lệnh này sẽ khởi chạy các container cần thiết: MongoDB (lưu trữ cứng), RabbitMQ (hàng đợi thông điệp), Redis (cache tốc độ cao) cùng các giao diện quản trị (UI) đi kèm.

> **🎛️ Bảng Điều Khiển Hạ Tầng (Management Dashboards):**
> - 🐰 **RabbitMQ Management:** [http://localhost:15672](http://localhost:15672) *(Tài khoản: `nam.dev` / Mật khẩu: `Nam12345@`)*
> - 🍃 **Mongo Express (MongoDB UI):** [http://localhost:8085](http://localhost:8085) *(Tài khoản: `admin` / Mật khẩu: `admin`)*
> - 🔴 **Redis Commander (Redis UI):** [http://localhost:8086](http://localhost:8086)

### 2. Thiết lập Môi trường Python
```bash
# Khởi tạo Virtual Environment
python -m venv venv

# Kích hoạt (Windows)
.\venv\Scripts\activate
# Kích hoạt (macOS/Linux)
source venv/bin/activate

# Cài đặt toàn bộ thư viện
pip install -r requirements.txt
```

### 3. Cấu hình & Chạy Tiến trình
Tạo file `.env` (từ file mẫu `.env.example`) và điều chỉnh thông số nếu bạn có các port/username khác.

Mở **Terminal 1** (Khởi chạy API Server):
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Mở **Terminal 2** (Khởi chạy OT Worker - Nhớ kích hoạt Virtual Environment trước):
```bash
python -m app.worker.consumer
```

### 4. Chạy nhiều OT Worker (Horizontal Scaling)
Hệ thống hỗ trợ mở rộng ngang cực mạnh mẽ nhờ cơ chế Consistent Hashing. Để tận dụng sức mạnh đa nhân CPU, bạn có thể phân tải sang nhiều Worker.

Mở file `.env` và khai báo số lượng hàng đợi (Ví dụ 4 hàng đợi):
```env
RABBITMQ_NUM_QUEUES=4
```

Tiếp theo, mở nhiều Terminal và chỉ định các hàng đợi (`WORKER_QUEUES`) mà mỗi Worker sẽ phụ trách xử lý:

**Terminal (Worker 1 - Xử lý Queue 0 và 1):**
```bash
# Cú pháp Linux/macOS
WORKER_QUEUES="0,1" python -m app.worker.consumer

# Cú pháp Windows (PowerShell)
$env:WORKER_QUEUES="0,1"; python -m app.worker.consumer
```

**Terminal (Worker 2 - Xử lý Queue 2 và 3):**
```bash
# Cú pháp Linux/macOS
WORKER_QUEUES="2,3" python -m app.worker.consumer

# Cú pháp Windows (PowerShell)
$env:WORKER_QUEUES="2,3"; python -m app.worker.consumer
```
> 💡 *Lưu ý: Dù chạy bao nhiêu Worker, các thao tác (Operations) thuộc cùng một tài liệu (`doc_id`) sẽ luôn được thuật toán Hashing định tuyến chính xác về chung 1 hàng đợi, đảm bảo tính tuần tự tuyệt đối (Strict Ordering).*

---

## 📂 Cấu Trúc Mã Nguồn

```text
backend/
├── app/
│   ├── api/            # Controller khai báo API Endpoints & WebSocket Routes
│   ├── core/           # Thuật toán cốt lõi (operation_transform.py, vector_clock)
│   ├── models/         # Pydantic Schemas giúp Validate Input/Output
│   ├── worker/         # RabbitMQ Consumer & Luồng thực thi OT Worker
│   └── main.py         # Entrypoint của toàn bộ ứng dụng FastAPI
├── infra/
│   ├── mongodb/        # Data Access Layer & Repositories cho MongoDB
│   ├── rabbitmq/       # Tích hợp kết nối và Producer Gateway cho RabbitMQ
│   └── redis/          # Tích hợp kết nối Client cho Redis
├── tests/              # Bộ Unit Tests nghiêm ngặt cho kiểm thử thuật toán OT
├── docker-compose.yml  # Định nghĩa các dịch vụ hạ tầng (Infra)
└── requirements.txt    # Danh sách thư viện Python phụ thuộc
```

---

## 🧪 Kiểm Thử (Testing)

Lõi thuật toán Operational Transformation (OT) vô cùng nhạy cảm với việc tính toán toán học dịch chuyển vị trí con trỏ (Index Shifting). Bất kì chỉnh sửa nào trong `app/core/` đều phải được chạy kiểm định kỹ lưỡng bằng Pytest:
```bash
python -m pytest tests/
```

---

## 👥 Contributors

Những kỹ sư tài năng đứng sau hệ thống Backend mạnh mẽ và kiến trúc thuật toán phân tán phức tạp này:

<a href="https://github.com/Nam0397681436/Collaborative-Systems/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Nam0397681436/Collaborative-Systems" alt="Contributors list" />
</a>

<div align="center">
  <p>Được xây dựng với ❤️ bởi cộng đồng lập trình viên Việt Nam.</p>
</div>
