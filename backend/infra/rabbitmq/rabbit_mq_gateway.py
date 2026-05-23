import aio_pika
import json
import hashlib
import os
import logging
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "localhost")
RABBITMQ_PORT = int(os.getenv("RABBITMQ_PORT", 5672))
RABBITMQ_USER = os.getenv("RABBITMQ_USER", "guest")
RABBITMQ_PASS = os.getenv("RABBITMQ_PASS", "guest")


class RabbitMQConnection:
    """Quản lý 1 connection duy nhất, nhưng 2 channel riêng biệt cho producer và consumer."""

    connection: aio_pika.RobustConnection = None
    producer_channel: aio_pika.Channel = (
        None  # Channel dành riêng cho Producer (publish)
    )
    consumer_channel: aio_pika.Channel = (
        None  # Channel dành riêng cho Consumer (subscribe)
    )


rabbitmq_conn = RabbitMQConnection()


async def connect_to_rabbitmq():
    logger.info("Connecting to RabbitMQ...")
    try:
        rabbitmq_conn.connection = await aio_pika.connect_robust(
            host=RABBITMQ_HOST,
            port=RABBITMQ_PORT,
            login=RABBITMQ_USER,
            password=RABBITMQ_PASS,
        )
        # Tạo 2 channel độc lập từ cùng 1 connection
        rabbitmq_conn.producer_channel = await rabbitmq_conn.connection.channel()
        rabbitmq_conn.consumer_channel = await rabbitmq_conn.connection.channel()
        
        # Khởi tạo lock cho producer an toàn tại thời điểm startup
        RabbitMQProducer._publish_lock = asyncio.Lock()
        
        logger.info(
            "Connected to RabbitMQ successfully! (producer_channel + consumer_channel opened)"
        )
    except Exception as e:
        logger.error(f"Error connecting to RabbitMQ: {e}")
        raise


async def close_rabbitmq_connection():
    logger.info("Closing RabbitMQ connection...")
    if rabbitmq_conn.connection:
        await rabbitmq_conn.connection.close()
    logger.info("RabbitMQ connection closed.")


def get_producer_channel() -> aio_pika.Channel:
    """Lấy channel dành riêng cho Producer."""
    if rabbitmq_conn.producer_channel is None:
        raise Exception(
            "RabbitMQ producer channel is not initialized. Call connect_to_rabbitmq() first."
        )
    return rabbitmq_conn.producer_channel


def get_consumer_channel() -> aio_pika.Channel:
    """Lấy channel dành riêng cho Consumer."""
    if rabbitmq_conn.consumer_channel is None:
        raise Exception(
            "RabbitMQ consumer channel is not initialized. Call connect_to_rabbitmq() first."
        )
    return rabbitmq_conn.consumer_channel


import asyncio


class RabbitMQProducer:
    """Producer dùng producer_channel riêng, không ảnh hưởng đến consumer."""

    _publish_lock = None

    def __init__(self):
        self.channel = get_producer_channel()

    async def publish(
        self,
        message: str,
        exchange: str,
        routing_key: str = "",
        exchange_type: str = "direct",
        durable: bool = True,
    ):
        async with RabbitMQProducer._publish_lock:
            msg = aio_pika.Message(
                body=message.encode(),
                content_type="application/json",
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            )
            exchange_obj = await self.channel.declare_exchange(
                name=exchange, type=exchange_type, durable=durable
            )
            await exchange_obj.publish(msg, routing_key=routing_key)


class RabbitMQConsumer:
    """Consumer dùng consumer_channel riêng, không bị ảnh hưởng bởi publisher."""

    def __init__(self):
        self.channel = get_consumer_channel()


def get_routing_key(doc_id: str, num_queue: int = 1) -> str:
    """Dùng hàm băm để phân chia doc vào các queue — dễ scale."""
    hash_hex = hashlib.md5(doc_id.encode()).hexdigest()
    queue_idx = int(hash_hex, 16) % num_queue
    return f"edit_queue_{queue_idx}"
