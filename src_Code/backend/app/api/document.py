import logging
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime
from model.enum_user_role import UserRole
from app.api.database import get_db, close_db
from model.connection_socket import connection_manager
from infra.redis.redis_client import RedisClient
from infra.mongodb.repository.operation_repo import OperationRepository
from infra.rabbitmq.rabbit_mq_gateway import RabbitMQProducer
import json

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/documents")
async def get_docs(dataReq: dict):
    """Tạo tài liệu mới"""
    ownerId = dataReq.get("ownerId", None)
    title = dataReq.get("title", None)

    if not ownerId:
        return {"success": False, "message": "Missing ownerId"}

    db = get_db()
    user_owner = await db.users.find_one({"_id": ObjectId(ownerId)})
    if not user_owner:
        return {"success": False, "message": "Không tìm thấy người sở hữu"}

    user_owner_name = (
        user_owner["username"]
        if "username" in user_owner
        else user_owner.get("name", "Unknown User")
    )

    new_document = {
        "title": title,
        "ownerId": ownerId,
        "collaborators": [{"user_id": ownerId, "role": "owner"}],
        "global_v_clock": {ownerId: 0},
        "content_snapshot": "",
        "epoch": 0,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
    }
    new_doc = await db.documents.insert_one(new_document)

    # Use aggregation pipeline to populate collaborators with user details
    pipeline = [
        {"$match": {"_id": new_doc.inserted_id}},
        {"$unwind": {"path": "$collaborators", "preserveNullAndEmptyArrays": True}},
        {
            "$lookup": {
                "from": "users",
                "let": {"user_id": "$collaborators.user_id"},
                "pipeline": [
                    {
                        "$match": {
                            "$expr": {"$eq": [{"$toString": "$_id"}, "$$user_id"]}
                        }
                    },
                    {
                        "$project": {
                            "_id": {"$toString": "$_id"},
                            "username": 1,
                            "email": 1,
                        }
                    },
                ],
                "as": "user_info",
            }
        },
        {"$unwind": {"path": "$user_info", "preserveNullAndEmptyArrays": True}},
        {
            "$addFields": {
                "collaborators": {
                    "_id": "$user_info._id",
                    "username": "$user_info.username",
                    "email": "$user_info.email",
                    "role": "$collaborators.role",
                }
            }
        },
        {
            "$group": {
                "_id": "$_id",
                "title": {"$first": "$title"},
                "ownerId": {"$first": "$ownerId"},
                "content_snapshot": {"$first": "$content_snapshot"},
                "created_at": {"$first": "$created_at"},
                "updated_at": {"$first": "$updated_at"},
                "collaborators": {"$push": "$collaborators"},
                "global_v_clock": {"$first": "$global_v_clock"},
            }
        },
        {"$addFields": {"_id": {"$toString": "$_id"}}},
    ]

    docs = await db.documents.aggregate(pipeline).to_list(length=1)

    if not docs:
        return {"success": False, "message": "Không thể tạo tài liệu"}

    return {"success": True, "document": docs[0]}


@router.get("/documents/{docId}")
async def get_doc(docId: str, requesterId: str | None = Query(default=None)):
    """Lấy tài liệu của người dùng và populate thông tin ownerId, collaborators"""
    db = get_db()

    if not ObjectId.is_valid(docId):
        raise HTTPException(status_code=400, detail="ID tài liệu không hợp lệ")

    # BẮT BUỘC phải lấy doc từ MongoDB để check quyền (ownerId, collaborators)
    doc = await db.documents.find_one({"_id": ObjectId(docId)})

    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")

    if not requesterId:
        raise HTTPException(
            status_code=403, detail="Không có quyền truy cập tài liệu này"
        )

    is_owner = str(doc.get("ownerId")) == str(requesterId)
    is_collaborator = any(
        str(collab.get("user_id")) == str(requesterId)
        for collab in doc.get("collaborators", [])
    )
    if not is_owner and not is_collaborator:
        raise HTTPException(
            status_code=403, detail="Không có quyền truy cập tài liệu này"
        )

    pipeline = [
        {"$match": {"_id": ObjectId(docId)}},
        {"$unwind": {"path": "$collaborators", "preserveNullAndEmptyArrays": True}},
        {
            "$lookup": {
                "from": "users",
                "let": {"user_id": "$collaborators.user_id"},
                "pipeline": [
                    {
                        "$match": {
                            "$expr": {"$eq": [{"$toString": "$_id"}, "$$user_id"]}
                        }
                    },
                    {
                        "$project": {
                            "_id": {"$toString": "$_id"},
                            "username": 1,
                            "email": 1,
                        }
                    },
                ],
                "as": "user_info",
            }
        },
        {"$unwind": {"path": "$user_info", "preserveNullAndEmptyArrays": True}},
        {
            "$addFields": {
                "collaborators": {
                    "_id": "$user_info._id",
                    "username": "$user_info.username",
                    "email": "$user_info.email",
                    "role": "$collaborators.role",
                }
            }
        },
        {
            "$group": {
                "_id": "$_id",
                "title": {"$first": "$title"},
                "ownerId": {"$first": "$ownerId"},
                "content_snapshot": {"$first": "$content_snapshot"},
                "epoch": {"$first": "$epoch"},
                "created_at": {"$first": "$created_at"},
                "updated_at": {"$first": "$updated_at"},
                "collaborators": {"$push": "$collaborators"},
                "global_v_clock": {"$first": "$global_v_clock"},
            }
        },
        {"$addFields": {"_id": {"$toString": "$_id"}}},
    ]

    docs = await db.documents.aggregate(pipeline).to_list(length=1)

    if not docs:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")
    document_data = docs[0]
    return {"success": True, "document": document_data}


@router.get("/users/{userId}/documents")
async def get_user_documents(userId: str):
    """Lấy toàn bộ danh sách tài liệu mà người dùng được tham gia (chủ sở hữu hoặc cộng tác viên)"""
    db = get_db()
    cursor = db.documents.find({"collaborators.user_id": userId}).sort("updated_at", -1)
    docs = await cursor.to_list(length=100)

    formatted_documents = []
    for doc in docs:
        formatted_documents.append(
            {
                "_id": str(doc["_id"]),
                "title": doc.get("title"),
                "ownerId": doc.get("ownerId"),
                "collaborators": doc.get("collaborators", []),
                "updated_at": doc.get("updated_at"),
            }
        )

    return {"success": True, "documents": formatted_documents}


@router.get("/users/{userId}/documents/shared")
async def get_shared_documents(userId: str):
    """Lấy toàn bộ danh sách tài liệu mà người dùng được chia sẻ"""
    db = get_db()
    cursor = db.documents.find(
        {"collaborators.user_id": userId, "ownerId": {"$ne": userId}}
    ).sort("updated_at", -1)
    docs = await cursor.to_list(length=100)

    formatted_documents = []
    for doc in docs:
        formatted_documents.append(
            {
                "_id": str(doc["_id"]),
                "title": doc.get("title"),
                "ownerId": doc.get("ownerId"),
                "collaborators": doc.get("collaborators", []),
                "updated_at": doc.get("updated_at"),
            }
        )

    return {"success": True, "documents": formatted_documents}


@router.put("/documents/{docId}")
async def update_doc(docId: str, dataReq: dict):
    """Cập nhật tiêu đề tài liệu"""
    new_title = dataReq.get("title", None)

    if not new_title:
        return {"success": False, "message": "Tiêu đề không được để trống"}

    db = get_db()
    result = await db.documents.update_one(
        {"_id": ObjectId(docId)}, {"$set": {"title": new_title}}
    )

    if result.matched_count == 0:
        return {"success": False, "message": "Không tìm thấy tài liệu để cập nhật"}

    updated_doc = await db.documents.find_one({"_id": ObjectId(docId)})
    if "_id" in updated_doc:
        updated_doc["_id"] = str(updated_doc["_id"])

    await connection_manager.broadcast_to_room(
        docId,
        {
            "type": "TITLE_UPDATE",
            "new_title": new_title,
        },
    )

    return {"success": True, "document": updated_doc}


@router.post("/documents/{docId}/collaborators")
async def add_collaborator(docId: str, dataReq: dict):

    email = dataReq.get("email") or dataReq.get("email_collaborator")
    role = dataReq.get("role") or "editor"

    if not email:
        return {"success": False, "message": "Email không được để trống"}

    db = get_db()
    # Enforce only owner can add collaborators
    requester_id = dataReq.get("requesterId")
    doc = await db.documents.find_one({"_id": ObjectId(docId)})
    if not doc:
        return {"success": False, "message": "Không tìm thấy tài liệu để cập nhật"}
    if not requester_id or str(doc.get("ownerId")) != str(requester_id):
        return {
            "success": False,
            "message": "Chỉ chủ sở hữu mới có thể thêm cộng tác viên",
        }
    user = await db.users.find_one({"email": email})
    if user is None:
        return {"success": False, "message": "Email không tồn tại"}
    collaborator_id = str(user["_id"])

    result = await db.documents.update_one(
        {"_id": ObjectId(docId)},
        {
            "$push": {
                "collaborators": {
                    "user_id": collaborator_id,
                    "role": role,
                    "addedAt": datetime.now(),
                }
            },
            "$set": {f"global_v_clock.{collaborator_id}": 0},
        },
    )

    if result.matched_count == 0:
        return {"success": False, "message": "Không tìm thấy tài liệu để cập nhật"}

    updated_doc = await db.documents.find_one({"_id": ObjectId(docId)})
    if "_id" in updated_doc:
        updated_doc["_id"] = str(updated_doc.pop("_id"))

    populated_collaborators = []
    for collab in updated_doc.get("collaborators", []):
        collab_user_id = collab.get("user_id")
        if collab_user_id:
            collab_user = await db.users.find_one({"_id": ObjectId(collab_user_id)})
            if collab_user:
                populated_collaborators.append(
                    {
                        "_id": str(collab_user["_id"]),
                        "username": collab_user.get(
                            "username", collab_user.get("name")
                        ),
                        "email": collab_user.get("email"),
                        "role": collab.get("role"),
                    }
                )

    updated_doc["collaborators"] = populated_collaborators

    # Include formatted global vector clock in the response
    vector_clock = updated_doc.get("global_v_clock", {})
    if isinstance(vector_clock, dict):
        formatted_global_v_clock = {str(k): int(v) for k, v in vector_clock.items()}
    else:
        formatted_global_v_clock = {}
    updated_doc["global_v_clock"] = formatted_global_v_clock

    return {"success": True, "document": updated_doc}


@router.delete("/documents/{docId}/collaborators/{collaboratorId}")
async def remove_collaborator(
    docId: str, collaboratorId: str, requesterId: str | None = None
):
    db = get_db()
    doc = await db.documents.find_one({"_id": ObjectId(docId)})
    if not doc:
        return {"success": False, "message": "Không tìm thấy tài liệu"}
    if not requesterId or str(doc.get("ownerId")) != str(requesterId):
        return {
            "success": False,
            "message": "Chỉ chủ sở hữu mới có thể xóa cộng tác viên",
        }

    result = await db.documents.update_one(
        {"_id": ObjectId(docId)},
        {"$pull": {"collaborators": {"user_id": collaboratorId}}},
    )

    if result.matched_count == 0:
        return {"success": False, "message": "Không tìm thấy tài liệu"}

    if result.modified_count == 0:
        return {"success": False, "message": "Không tìm thấy cộng tác viên"}

    updated_doc = await db.documents.find_one({"_id": ObjectId(docId)})
    if "_id" in updated_doc:
        updated_doc["_id"] = str(updated_doc.pop("_id"))

    populated_collaborators = []
    for collab in updated_doc.get("collaborators", []):
        collab_user_id = collab.get("user_id")
        if collab_user_id:
            collab_user = await db.users.find_one({"_id": ObjectId(collab_user_id)})
            if collab_user:
                populated_collaborators.append(
                    {
                        "_id": str(collab_user["_id"]),
                        "username": collab_user.get(
                            "username", collab_user.get("name")
                        ),
                        "email": collab_user.get("email"),
                        "role": collab.get("role"),
                    }
                )

    updated_doc["collaborators"] = populated_collaborators

    try:
        await connection_manager.broadcast_to_room(
            docId,
            {
                "type": "COLLABORATOR_REMOVED",
                "user_id": collaboratorId,
            },
        )
    except Exception as e:
        logger.error(f"Lỗi khi broadcast xóa cộng tác viên cho document {docId}: {e}")

    return {"success": True, "document": updated_doc}


@router.put("/documents/{docId}/collaborators/{collaboratorId}/role")
async def update_collaborator_role(docId: str, collaboratorId: str, dataReq: dict):
    role = dataReq.get("role")
    requester_id = dataReq.get("requesterId")
    if role not in ["viewer", "editor"]:
        return {"success": False, "message": "Vai trò không hợp lệ"}

    db = get_db()
    # enforce only owner can change roles
    doc = await db.documents.find_one({"_id": ObjectId(docId)})
    if not doc:
        return {"success": False, "message": "Không tìm thấy tài liệu"}
    if not requester_id or str(doc.get("ownerId")) != str(requester_id):
        return {
            "success": False,
            "message": "Chỉ chủ sở hữu mới có thể thay đổi vai trò",
        }

    result = await db.documents.update_one(
        {"_id": ObjectId(docId), "collaborators.user_id": collaboratorId},
        {"$set": {"collaborators.$.role": role}},
    )

    if result.matched_count == 0:
        return {
            "success": False,
            "message": "Không tìm thấy tài liệu hoặc cộng tác viên",
        }

    updated_doc = await db.documents.find_one({"_id": ObjectId(docId)})
    if "_id" in updated_doc:
        updated_doc["_id"] = str(updated_doc.pop("_id"))

    populated_collaborators = []
    for collab in updated_doc.get("collaborators", []):
        collab_user_id = collab.get("user_id")
        if collab_user_id:
            collab_user = await db.users.find_one({"_id": ObjectId(collab_user_id)})
            if collab_user:
                populated_collaborators.append(
                    {
                        "_id": str(collab_user["_id"]),
                        "username": collab_user.get(
                            "username", collab_user.get("name")
                        ),
                        "email": collab_user.get("email"),
                        "role": collab.get("role"),
                    }
                )

    updated_doc["collaborators"] = populated_collaborators

    try:
        await connection_manager.broadcast_to_room(
            docId,
            {
                "type": "ROLE_UPDATE",
                "user_id": collaboratorId,
                "new_role": role,
            },
        )
    except Exception as e:
        logger.error(f"Lỗi khi broadcast cập nhật role cho document {docId}: {e}")

    return {"success": True, "document": updated_doc}


@router.delete("/documents/{docId}")
async def delete_doc(docId: str, userId: str | None = Query(default=None)):
    db = get_db()
    doc = await db.documents.find_one({"_id": ObjectId(docId)})
    if not doc:
        return {"success": False, "message": "Không tìm thấy tài liệu"}
    if not userId or str(doc.get("ownerId")) != str(userId):
        return {"success": False, "message": "Chỉ chủ sở hữu mới có thể xóa tài liệu"}

    result = await db.documents.delete_one({"_id": ObjectId(docId)})

    if result.deleted_count == 0:
        return {"success": False, "message": "Không tìm thấy tài liệu để xóa"}

    return {"success": True, "message": "Xóa tài liệu thành công"}


@router.get("/documents/{docId}/versions")
async def get_doc_versions(docId: str):
    """
    Lấy toàn bộ danh sách các checkpoint phiên bản của tài liệu.
    """
    try:
        checkpoints = await OperationRepository.get_checkpoints(docId)
        return {"success": True, "versions": checkpoints}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Lỗi khi lấy danh sách phiên bản: {str(e)}"
        )


@router.get("/documents/{docId}/versions/{version_number}")
async def get_doc_version_preview(docId: str, version_number: int):
    """
    Phục dựng nội dung phiên bản lịch sử cụ thể (Checkpoint).
    """
    try:
        checkpoint = await OperationRepository.get_checkpoint_by_version(
            docId, version_number
        )
        if not checkpoint:
            raise HTTPException(
                status_code=404, detail="Không tìm thấy checkpoint phiên bản tương ứng"
            )

        # Vì version_number đại diện chính xác cho 1 Checkpoint, ta không cần cộng thêm Delta
        # (Việc cộng Delta của các operations sau đó sẽ dẫn đến trộn lẫn timeline nếu đã từng khôi phục)
        checkpoint_snapshot = checkpoint.get("content_snapshot", "")

        return {
            "success": True,
            "version_number": version_number,
            "epoch": checkpoint.get("epoch", 0),
            "v_clock": checkpoint.get("checkpoint_v_clock", {}),
            "content": checkpoint_snapshot,
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Lỗi khi phục dựng phiên bản: {str(e)}"
        )


@router.post("/documents/{docId}/versions/{version_number}/revert")
async def revert_doc_to_version(
    docId: str, version_number: int, requesterId: str | None = Query(default=None)
):
    """
    Khôi phục tài liệu về một phiên bản lịch sử cụ thể (Epoch Versioning).
    Ghi đè MongoDB, dọn cache Redis, tăng epoch và broadcast sự kiện REVERT qua RabbitMQ.
    """
    db = get_db()
    # Kiểm tra quyền sở hữu hoặc cộng tác viên
    doc = await db.documents.find_one({"_id": ObjectId(docId)})
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")
    if not requesterId:
        raise HTTPException(status_code=403, detail="Không có quyền truy cập")

    # TODO: Phân quyền Editor & Viewer
    is_owner = str(doc.get("ownerId")) == str(requesterId)
    is_collaborator = any(
        str(collab.get("user_id")) == str(requesterId)
        for collab in doc.get("collaborators", [])
    )
    if not is_owner and not is_collaborator:
        raise HTTPException(
            status_code=403, detail="Không có quyền thực hiện khôi phục"
        )

    try:
        # 1. Lấy nội dung của phiên bản tương ứng
        checkpoint = await OperationRepository.get_checkpoint_by_version(
            docId, version_number
        )
        if not checkpoint:
            raise HTTPException(
                status_code=404, detail="Không tìm thấy checkpoint phiên bản"
            )

        reconstructed_text = checkpoint.get("content_snapshot", "")
        revert_clock = checkpoint.get("checkpoint_v_clock", {})

        # 2. Tăng Epoch mới của tài liệu lên 1
        new_epoch = doc.get("epoch", 0) + 1

        # 3. Ghi đè lên documents chính trong MongoDB
        await db.documents.update_one(
            {"_id": ObjectId(docId)},
            {
                "$set": {
                    "content_snapshot": reconstructed_text,
                    "epoch": new_epoch,
                    "global_v_clock": revert_clock,
                    "updated_at": datetime.utcnow(),
                }
            },
        )

        # 4. Ghi đè lên cache Redis và xóa lịch sử thao tác cũ
        redis_client = RedisClient.get_client()
        await redis_client.set(f"snapshot:{docId}", reconstructed_text)
        await redis_client.set(f"snapshot_count:{docId}", 0)
        await redis_client.delete(f"doc_history:{docId}")

        # 5. Phát sự kiện REVERT qua RabbitMQ để tự động đồng bộ tức thời toàn phòng
        revert_clock = checkpoint.get("checkpoint_v_clock", {})
        revert_payload = {
            "type": "REVERT",
            "doc_id": docId,
            "v_clock": revert_clock,  # Dùng clock từ checkpoint gốc làm clock xuất phát tiếp theo cho mọi người
            "epoch": new_epoch,
            "content": reconstructed_text,
        }

        producer = RabbitMQProducer()
        await producer.publish(
            message=json.dumps(revert_payload),
            exchange="broadcast_to_room",
            routing_key="",
            exchange_type="fanout",
            durable=False,
        )

        logger.info(
            f"Document {docId} successfully reverted to version {version_number} with new epoch {new_epoch}"
        )
        return {
            "success": True,
            "message": "Khôi phục tài liệu thành công",
            "epoch": new_epoch,
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Lỗi khi khôi phục phiên bản: {str(e)}"
        )
