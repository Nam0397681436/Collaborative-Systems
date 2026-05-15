from app.models.ot_operation import InsertOperation, DeleteOperation, RetainOperation, BaseOperation
from typing import Union

OpType = Union[InsertOperation, DeleteOperation, RetainOperation]

def transform(op1: OpType, op2: OpType) -> OpType:
    """
    Biến đổi op1 dựa trên op2. 
    Trả về op1' đã được hiệu chỉnh vị trí.
    """
    # Nếu 1 trong 2 là thao tác rỗng, không cần biến đổi
    if isinstance(op1, RetainOperation):
        return op1
    if isinstance(op2, RetainOperation):
        return op1

    if isinstance(op1, InsertOperation) and isinstance(op2, InsertOperation):
        if op1.index < op2.index:
            return op1
        elif op1.index > op2.index:
            return InsertOperation(**{**op1.model_dump(), "index": op1.index + 1})
        else:
            # Tie-breaker logic cho 2 thao tác Insert cùng index
            if op1.user_id < op2.user_id:
                return op1
            else:
                return InsertOperation(**{**op1.model_dump(), "index": op1.index + 1})

    elif isinstance(op1, InsertOperation) and isinstance(op2, DeleteOperation):
        if op1.index <= op2.index:
            return op1
        else:
            return InsertOperation(**{**op1.model_dump(), "index": op1.index - 1})

    elif isinstance(op1, DeleteOperation) and isinstance(op2, InsertOperation):
        if op1.index < op2.index:
            return op1
        else:
            return DeleteOperation(**{**op1.model_dump(), "index": op1.index + 1})

    elif isinstance(op1, DeleteOperation) and isinstance(op2, DeleteOperation):
        if op1.index < op2.index:
            return op1
        elif op1.index > op2.index:
            return DeleteOperation(**{**op1.model_dump(), "index": op1.index - 1})
        else:
            # Cùng xóa 1 vị trí -> op1 trở thành rỗng (NoOp)
            return RetainOperation(
                op_type="retain",
                user_id=op1.user_id,
                doc_id=op1.doc_id,
                v_clock=op1.v_clock
            )
            
    return op1
