import aio_pika
import json
import hashlib 
from dotenv import load_dotenv
import os
load_dotenv()


RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "localhost")
RABBITMQ_PORT = int(os.getenv("RABBITMQ_PORT", 5672))

class RabbitMQProducer:
    def __init__(self, host: str = RABBITMQ_HOST, port: int = RABBITMQ_PORT):
        self.host = host
        self.port = port
        self.connection = None
        self.channel = None
    async def connect(self):
        self.connection = await aio_pika.connect(host=self.host, port=self.port)
        self.channel = await self.connection.channel()
    async def publish(self, message: str, exchange: str, routing_key: str):
        await self.channel.basic_publish()(
            routing_key=routing_key,
            exchange=exchange,
            body= json.dumps(message),
            properties=aio_pika.BasicProperties(
                content_type="application/json",
                delivery_mode=2
            )
        )
    async def close(self):
        await self.connection.close()

class RabbitMQConsumer:
    def __init__(self, host: str = RABBITMQ_HOST, port: int = RABBITMQ_PORT):
        self.host = host
        self.port = port
        self.connection = None
        self.channel = None
    async def connect(self):
        self.connection = await aio_pika.connect(host=self.host, port=self.port)
        self.channel = await self.connection.channel()
    async def consume(self):
        pass
    async def on_message(self, message):
        pass
    async def close(self):
        pass

def get_routing_key(doc_id: str, num_queue: int=1): # dùng hàm băm để tự chia các doc về các queue dễ scale
    hash_hex=hashlib.md5(doc_id.encode()).hexdigest()
    queue_idx=int(hash_hex, 16) % num_queue
    return f"edit_queue_{queue_idx}"