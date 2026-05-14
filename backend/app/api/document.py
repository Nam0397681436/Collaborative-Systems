from fastapi import APIRouter, HTTPException
from datetime import datetime
from model.enum_user_role import UserRole
from app.api.database import get_db, close_db
from bson import ObjectId


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

    user_owner_name=user_owner["name"]

    new_document = {
        "title": title,
        "ownerId": ownerId,
        "collaborators": [{"user_id":ownerId,"role":"owner","username":user_owner_name}],
        "content_snapshot": "",
        "created_at": datetime.now(),
        "updated_at": datetime.now()
    }
    new_doc = await db.documents.insert_one(new_document)
    
    return {"success": True,
            "document": 
                {"_id": str(new_doc.inserted_id),
                "title": title,
                "ownerId": ownerId,
                "vectorClock":{
                    ownerId: 0
                },
                "collaborators": [{"user_id":ownerId,"role":"owner"}]
                }
            }


@router.get("/documents/{docId}")
async def get_doc(docId: str):
    """Lấy tài liệu của người dùng và populate thông tin ownerId, collaborators"""
    db = get_db()
    
    if not ObjectId.is_valid(docId):
        return {"success": False, "message": "ID tài liệu không hợp lệ"}

    pipeline = [
        {"$match": {"_id": ObjectId(docId)}},
        {
            "$lookup": {
                "from": "users",
                "let": {"owner_id_str": "$ownerId"},
                "pipeline": [
                    {"$match": {"$expr": {"$eq": [{"$toString": "$_id"}, "$$owner_id_str"]}}},
                    {"$project": {"_id": {"$toString": "$_id"}, "username": 1, "email": 1}}
                ],
                "as": "ownerId"
            }
        },
        {"$unwind": {"path": "$ownerId", "preserveNullAndEmptyArrays": True}},
        {
            "$lookup": {
                "from": "users",
                "let": {"collab_user_ids": "$collaborators.user_id"},
                "pipeline": [
                    {"$match": {"$expr": {"$in": [{"$toString": "$_id"}, {"$ifNull": ["$$collab_user_ids", []]}]}}},
                    {"$project": {"_id": {"$toString": "$_id"}, "username": 1, "email": 1}}
                ],
                "as": "populated_collaborators"
            }
        },
        {
            "$addFields": {
                "_id": {"$toString": "$_id"},
                "collaborators": "$populated_collaborators"
            }
        },
        {
            "$project": {
                "populated_collaborators": 0
            }
        }
    ]

    docs = await db.documents.aggregate(pipeline).to_list(length=1)
    
    if not docs:
        return {"success": False, "message": "Không tìm thấy tài liệu"}
        
    return {"success": True, "document": docs[0]}

@router.get("/users/{userId}/documents")
async def get_user_documents(userId: str):
    """Lấy toàn bộ danh sách tài liệu mà người dùng được tham gia (chủ sở hữu hoặc cộng tác viên)"""
    db = get_db()
    cursor = db.documents.find({"collaborators.user_id": userId})
    docs = await cursor.to_list(length=100)
    
    formatted_documents = []
    for doc in docs:
        formatted_documents.append({
            "_id": str(doc["_id"]),
            "title": doc.get("title"),
            "ownerId": doc.get("ownerId"),
            "collaborators": doc.get("collaborators", [])
        })
        
    return {
        "success": True, 
        "documents": formatted_documents
    }

@router.get("/users/{userId}/documents/shared")
async def get_shared_documents(userId: str):
    """Lấy toàn bộ danh sách tài liệu mà người dùng được chia sẻ"""
    db = get_db()
    cursor = db.documents.find({"collaborators.user_id": userId, "ownerId": {"$ne": userId}})
    docs = await cursor.to_list(length=100)
    
    formatted_documents = []
    for doc in docs:
        formatted_documents.append({
            "_id": str(doc["_id"]),
            "title": doc.get("title"),
            "ownerId": doc.get("ownerId"),
            "collaborators": doc.get("collaborators", [])
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
    user = await db.users.find_one({"email": email})
    if user is None:
        return {"success": False, "message": "Email không tồn tại"}
    collaborator_id = str(user["_id"])
    
    result = await db.documents.update_one(
        {"_id": ObjectId(docId)},
        {"$push": {"collaborators": {"user_id": collaborator_id, "role": role, "addedAt": datetime.now()}}}
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
    
    return {
        "success": True,
        "document": updated_doc
    } 

@router.delete("/documents/{docId}/collaborators/{collaboratorId}")
async def remove_collaborator(docId: str, collaboratorId: str):
    db = get_db()
    
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
    
    return {"success": True, "document": updated_doc}   

@router.put("/documents/{docId}/collaborators/{collaboratorId}/role")
async def update_collaborator_role(docId: str, collaboratorId: str, dataReq: dict):
    role = dataReq.get("role")
    if role not in ["viewer", "editor"]:
        return {"success": False, "message": "Vai trò không hợp lệ"}
        
    db = get_db()
    
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
    
    return {
        "success": True,
        "document": updated_doc
    }

@router.delete("/documents/{docId}")
async def delete_doc(docId: str):
    db = get_db()
    result = await db.documents.delete_one({"_id": ObjectId(docId)})

    if result.deleted_count == 0:
        return {"success": False, "message": "Không tìm thấy tài liệu để xóa"}

    return {"success": True, "message": "Xóa tài liệu thành công"}   