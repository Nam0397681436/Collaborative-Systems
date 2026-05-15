# Collaborative Text Editor - Backend System

Hệ thống Backend được xây dựng để cung cấp nền tảng chỉnh sửa văn bản theo thời gian thực (Real-time Collaborative Editing), tương tự như kiến trúc của Google Docs. Dự án sử dụng mô hình Centralized Operational Transformation (OT) kết hợp với các công nghệ phân tán để đảm bảo tính nhất quán dữ liệu ở quy mô lớn.

## 🚀 Công Nghệ Sử Dụng (Tech Stack)

*   **Core Framework**: FastAPI (Python 3.11+) cho hiệu suất bất đồng bộ (AsyncIO) tốc độ cao.
*   **Database**: MongoDB (với driver `motor`) dùng để lưu trữ Document và Lịch sử Thao tác (Operation Logs).
*   **Message Broker**: RabbitMQ (với driver `aio-pika`) dùng để phân luồng sự kiện (Message Queuing) và phát sóng sự kiện (Fanout Broadcast).
*   **Caching**: Redis (với driver `redis.asyncio`) dùng làm lớp đệm tốc độ cao cho Lịch sử OT.
*   **Testing**: Pytest hỗ trợ Test-Driven Development (TDD).

## 🏗️ Kiến Trúc Hệ Thống (Architecture)

Hệ thống được chia thành 2 luồng tiến trình chạy song song và độc lập:

### 1. API Server (FastAPI + WebSockets)
*   Chịu trách nhiệm cung cấp REST API (Auth, Document CRUD).
*   Mở và duy trì kết nối WebSockets với các trình duyệt Frontend.
*   Nhận thao tác gõ phím từ người dùng, đưa vào RabbitMQ.
*   Lắng nghe Broadcast từ RabbitMQ Fanout để phản hồi dữ liệu đã đồng bộ ngược lại cho người dùng.

### 2. OT Worker (Tiến trình Xử lý Ngầm)
*   Sử dụng cơ chế **Consistent Hashing** trên `doc_id` để kéo tuần tự các thông điệp từ RabbitMQ (Đảm bảo Strict Ordering).
*   Kiểm tra tính nhân quả (Causality Check) thông qua **Đồng hồ Vector (Vector Clocks)**.
*   Chạy thuật toán **Operational Transformation (OT) 3x3 Matrix** (Insert/Delete/Retain) để giải quyết xung đột (Conflict Resolution). Có tích hợp "Tie-breaker logic" khi người dùng gõ đè lên cùng 1 vị trí.
*   Cập nhật Database sử dụng toán tử Atomic (`$inc`) và lưu Cache qua Redis (`LTRIM`).
*   Broadcast kết quả ra Exchange `broadcast_to_room`.

## ⚙️ Yêu cầu Hệ thống (Prerequisites)

*   Python 3.11 trở lên.
*   Docker & Docker Compose (để chạy hạ tầng).

## 🛠️ Cài đặt và Khởi chạy (Setup & Run)

### Bước 1: Khởi động Hạ tầng (Infra)
Dự án đã có sẵn file `docker-compose.yml` để khởi tạo MongoDB, RabbitMQ và Redis.
```bash
docker-compose up -d
```

### Bước 2: Cài đặt thư viện Python
Nên tạo một Virtual Environment (venv) trước khi cài đặt.
```bash
python -m venv venv
# Active venv (Windows)
.\venv\Scripts\activate 
# Active venv (Mac/Linux)
source venv/bin/activate

pip install -r requirements.txt
```

### Bước 3: Cấu hình Môi trường (.env)
Tạo file `.env` ở thư mục `backend/` với nội dung cơ bản sau:
```env
MONGODB_URL=mongodb://localhost:27017/
MONGODB_DB_NAME=collaborative_db

RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=guest
RABBITMQ_PASS=guest

# Chú ý: Nếu mật khẩu có ký tự @ thì phải URL encode thành %40
REDIS_URL=redis://localhost:6379/0

RABBITMQ_NUM_QUEUES=1 # 4
WORKER_QUEUES=0 # 0,1,2,3
```

### Bước 4: Chạy Server (Cần mở 2 Terminal)

**Terminal 1: Chạy API Server (Uvicorn)**
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2: Chạy OT Worker**
```bash
python -m app.worker.consumer
```

## 🧪 Kiểm thử (Testing)
Hệ thống lõi OT được test kín bằng `pytest` để đảm bảo không sai lệch vị trí con trỏ văn bản (Index Shifting).
```bash
python -m pytest tests/
```

## 📂 Cấu trúc Thư mục Chính
```text
backend/
├── app/
│   ├── api/            # API Endpoints & WebSocket Routes
│   ├── core/           # Thuật toán OT (operation_transform.py)
│   ├── models/         # Pydantic Schema Models
│   ├── worker/         # Logic của RabbitMQ Consumer (OT Worker)
│   └── main.py         # Điểm khởi chạy của FastAPI
├── infra/
│   ├── mongodb/        # Kết nối và Query (Repository Pattern)
│   ├── rabbitmq/       # Kết nối & Producer Gateway
│   └── redis/          # Client cấu hình Redis
├── tests/              # TDD Unit Tests cho thuật toán
└── requirements.txt
```
