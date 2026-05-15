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

class RabbitMQConnection:
    connection: aio_pika.RobustConnection = None
    channel: aio_pika.Channel = None

rabbitmq_conn = RabbitMQConnection()

async def connect_to_rabbitmq():
    logger.info("Connecting to RabbitMQ...")
    try:
        rabbitmq_conn.connection = await aio_pika.connect_robust(
            host=RABBITMQ_HOST, port=RABBITMQ_PORT
        )
        rabbitmq_conn.channel = await rabbitmq_conn.connection.channel()
        logger.info("Connected to RabbitMQ successfully!")
    except Exception as e:
        logger.error(f"Error connecting to RabbitMQ: {e}")

async def close_rabbitmq_connection():
    logger.info("Closing RabbitMQ connection...")
    if rabbitmq_conn.connection:
        await rabbitmq_conn.connection.close()
    logger.info("RabbitMQ connection closed.")

def get_rabbitmq_channel() -> aio_pika.Channel:
    if rabbitmq_conn.channel is None:
        raise Exception("RabbitMQ is not initialized. Please call connect_to_rabbitmq() first.")
    return rabbitmq_conn.channel

class RabbitMQProducer:
    def __init__(self):
        self.channel = get_rabbitmq_channel()

    async def publish(self, message: str, exchange_name: str, routing_key: str):
        # message là json string
        msg = aio_pika.Message(
            body=message.encode(),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT
        )
        
        # Declare exchange to ensure it exists
        exchange = await self.channel.declare_exchange(
            name=exchange_name,
            type="direct",
            durable=True
        )
        
        await exchange.publish(msg, routing_key=routing_key)

class RabbitMQConsumer:
    def __init__(self):
        self.channel = get_rabbitmq_channel()

    async def consume(self):
        pass

def get_routing_key(doc_id: str, num_queue: int=1): 
    # dùng hàm băm để tự chia các doc về các queue dễ scale
    hash_hex = hashlib.md5(doc_id.encode()).hexdigest()
    queue_idx = int(hash_hex, 16) % num_queue
    return f"edit_queue_{queue_idx}"
