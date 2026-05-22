from fastapi import APIRouter, HTTPException, Query
from datetime import datetime
from model.enum_user_role import UserRole
from app.api.database import get_db, close_db
from bson import ObjectId
from model.connection_socket import connection_manager

router = APIRouter()

@router.post("/documents")
async def get_docs(dataReq: dict):
    """Tạo tài liệu mới"""
    ownerId = dataReq.get("ownerId", None)
    title = dataReq.get("title", None)
    

    if not ownerId:
        return {"success": False, "message": "Missing ownerId"}

    db = get_db()
    user_owner=await db.users.find_one({"_id": ObjectId(ownerId)})
    if not user_owner:
        return {"success": False, "message": "Không tìm thấy người sở hữu"}

    user_owner_name=user_owner["username"] if "username" in user_owner else user_owner.get("name", "Unknown User")

    new_document = {
        "title": title,
        "ownerId": ownerId,
        "collaborators": [{"user_id":ownerId,"role":"owner"}],
        "global_v_clock": {ownerId: 0},
        "content_snapshot": "",
        "created_at": datetime.now(),
        "updated_at": datetime.now()
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
                    {"$match": {"$expr": {"$eq": [{"$toString": "$_id"}, "$$user_id"]}}},
                    {"$project": {"_id": {"$toString": "$_id"}, "username": 1, "email": 1}}
                ],
                "as": "user_info"
            }
        },
        {"$unwind": {"path": "$user_info", "preserveNullAndEmptyArrays": True}},
        {
            "$addFields": {
                "collaborators": {
                    "_id": "$user_info._id",
                    "username": "$user_info.username",
                    "email": "$user_info.email",
                    "role": "$collaborators.role"
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
                "global_v_clock": {"$first": "$global_v_clock"}
            }
        },
        {
            "$addFields": {
                "_id": {"$toString": "$_id"}
            }
        }
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

    doc = await db.documents.find_one({"_id": ObjectId(docId)})
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")

    if not requesterId:
        raise HTTPException(status_code=403, detail="Không có quyền truy cập tài liệu này")

    is_owner = str(doc.get("ownerId")) == str(requesterId)
    is_collaborator = any(str(collab.get("user_id")) == str(requesterId) for collab in doc.get("collaborators", []))
    if not is_owner and not is_collaborator:
        raise HTTPException(status_code=403, detail="Không có quyền truy cập tài liệu này")

    pipeline = [
        {"$match": {"_id": ObjectId(docId)}},
        {"$unwind": {"path": "$collaborators", "preserveNullAndEmptyArrays": True}},
        {
            "$lookup": {
                "from": "users",
                "let": {"user_id": "$collaborators.user_id"},
                "pipeline": [
                    {"$match": {"$expr": {"$eq": [{"$toString": "$_id"}, "$$user_id"]}}},
                    {"$project": {"_id": {"$toString": "$_id"}, "username": 1, "email": 1}}
                ],
                "as": "user_info"
            }
        },
        {"$unwind": {"path": "$user_info", "preserveNullAndEmptyArrays": True}},
        {
            "$addFields": {
                "collaborators": {
                    "_id": "$user_info._id",
                    "username": "$user_info.username",
                    "email": "$user_info.email",
                    "role": "$collaborators.role"
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
                "global_v_clock": {"$first": "$global_v_clock"}
            }
        },
        {
            "$addFields": {
                "_id": {"$toString": "$_id"}
            }
        }
    ]

    docs = await db.documents.aggregate(pipeline).to_list(length=1)
    
    if not docs:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu")
        
    return {"success": True, "document": docs[0]}

@router.get("/users/{userId}/documents")
async def get_user_documents(userId: str):
    """Lấy toàn bộ danh sách tài liệu mà người dùng được tham gia (chủ sở hữu hoặc cộng tác viên)"""
    db = get_db()
    cursor = db.documents.find({"collaborators.user_id": userId}).sort("updated_at", -1)
    docs = await cursor.to_list(length=100)
    
    formatted_documents = []
    for doc in docs:
        formatted_documents.append({
            "_id": str(doc["_id"]),
            "title": doc.get("title"),
            "ownerId": doc.get("ownerId"),
            "collaborators": doc.get("collaborators", []),
            "updated_at": doc.get("updated_at")
        })
        
    return {
        "success": True, 
        "documents": formatted_documents
    }

@router.get("/users/{userId}/documents/shared")
async def get_shared_documents(userId: str):
    """Lấy toàn bộ danh sách tài liệu mà người dùng được chia sẻ"""
    db = get_db()
    cursor = db.documents.find({"collaborators.user_id": userId, "ownerId": {"$ne": userId}}).sort("updated_at", -1)
    docs = await cursor.to_list(length=100)
    
    formatted_documents = []
    for doc in docs:
        formatted_documents.append({
            "_id": str(doc["_id"]),
            "title": doc.get("title"),
            "ownerId": doc.get("ownerId"),
            "collaborators": doc.get("collaborators", []),
            "updated_at": doc.get("updated_at")
        })
        
    return {
        "success": True, 
        "documents": formatted_documents
    }

@router.put("/documents/{docId}")
async def update_doc(docId: str, dataReq: dict):
    """Cập nhật tiêu đề tài liệu"""
    new_title = dataReq.get("title", None)
    
    if not new_title:
        return {"success": False, "message": "Tiêu đề không được để trống"}

    db = get_db()
    result = await db.documents.update_one(
        {"_id": ObjectId(docId)},
        {"$set": {"title": new_title}}
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

    return {
        "success": True,
        "document": updated_doc
    } 

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
        return {"success": False, "message": "Chỉ chủ sở hữu mới có thể thêm cộng tác viên"}
    user = await db.users.find_one({"email": email})
    if user is None:
        return {"success": False, "message": "Email không tồn tại"}
    collaborator_id = str(user["_id"])
    
    result = await db.documents.update_one(
        {"_id": ObjectId(docId)},
        {
            "$push": {"collaborators": {"user_id": collaborator_id, "role": role, "addedAt": datetime.now()}},
            "$set": {f"global_v_clock.{collaborator_id}": 0}
        }
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
                populated_collaborators.append({
                    "_id": str(collab_user["_id"]),
                    "username": collab_user.get("username", collab_user.get("name")),
                    "email": collab_user.get("email"),
                    "role": collab.get("role")
                })
    
    updated_doc["collaborators"] = populated_collaborators
    
    # Include formatted global vector clock in the response
    vector_clock = updated_doc.get("global_v_clock", {})
    if isinstance(vector_clock, dict):
        formatted_global_v_clock = {str(k): int(v) for k, v in vector_clock.items()}
    else:
        formatted_global_v_clock = {}
    updated_doc["global_v_clock"] = formatted_global_v_clock

    return {
        "success": True,
        "document": updated_doc
    } 

@router.delete("/documents/{docId}/collaborators/{collaboratorId}")
async def remove_collaborator(docId: str, collaboratorId: str, requesterId: str | None = None):
    db = get_db()
    doc = await db.documents.find_one({"_id": ObjectId(docId)})
    if not doc:
        return {"success": False, "message": "Không tìm thấy tài liệu"}
    if not requesterId or str(doc.get("ownerId")) != str(requesterId):
        return {"success": False, "message": "Chỉ chủ sở hữu mới có thể xóa cộng tác viên"}

    result = await db.documents.update_one(
        {"_id": ObjectId(docId)},
        {"$pull": {"collaborators": {"user_id": collaboratorId}}}
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
                populated_collaborators.append({
                    "_id": str(collab_user["_id"]),
                    "username": collab_user.get("username", collab_user.get("name")),
                    "email": collab_user.get("email"),
                    "role": collab.get("role")
                })
    
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
        print.error(f"Lỗi khi broadcast xóa cộng tác viên cho document {docId}: {e}")
    
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
        return {"success": False, "message": "Chỉ chủ sở hữu mới có thể thay đổi vai trò"}

    result = await db.documents.update_one(
        {"_id": ObjectId(docId), "collaborators.user_id": collaboratorId},
        {"$set": {"collaborators.$.role": role}}
    )
    
    if result.matched_count == 0:
        return {"success": False, "message": "Không tìm thấy tài liệu hoặc cộng tác viên"}

    updated_doc = await db.documents.find_one({"_id": ObjectId(docId)})
    if "_id" in updated_doc:
        updated_doc["_id"] = str(updated_doc.pop("_id"))
        
    populated_collaborators = []
    for collab in updated_doc.get("collaborators", []):
        collab_user_id = collab.get("user_id")
        if collab_user_id:
            collab_user = await db.users.find_one({"_id": ObjectId(collab_user_id)})
            if collab_user:
                populated_collaborators.append({
                    "_id": str(collab_user["_id"]),
                    "username": collab_user.get("username", collab_user.get("name")),
                    "email": collab_user.get("email"),
                    "role": collab.get("role")
                })
    
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
        print.error(f"Lỗi khi broadcast cập nhật role cho document {docId}: {e}")
    
    return {
        "success": True,
        "document": updated_doc
    }

@router.delete("/documents/{docId}")
async def delete_doc(docId: str, requesterId: str | None = Query(default=None)):
    db = get_db()
    doc = await db.documents.find_one({"_id": ObjectId(docId)})
    if not doc:
        return {"success": False, "message": "Không tìm thấy tài liệu"}
    if not requesterId or str(doc.get("ownerId")) != str(requesterId):
        return {"success": False, "message": "Chỉ chủ sở hữu mới có thể xóa tài liệu"}
    
    result = await db.documents.delete_one({"_id": ObjectId(docId)})

    if result.deleted_count == 0:
        return {"success": False, "message": "Không tìm thấy tài liệu để xóa"}

    return {"success": True, "message": "Xóa tài liệu thành công"}   