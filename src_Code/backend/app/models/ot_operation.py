from pydantic import BaseModel, Field
from typing import Literal, Union, Optional
from typing_extensions import Annotated

class BaseOperation(BaseModel):
    user_id: str
    doc_id: str
    v_clock: dict[str, int]
    opId: Optional[str] = None
    epoch: int = 0
    
class InsertOperation(BaseOperation):
    op_type: Literal['insert']
    char: str
    index: int

class DeleteOperation(BaseOperation):
    op_type: Literal['delete']
    char: str
    index: int

class RetainOperation(BaseOperation):
    op_type: Literal['retain']
    # Retain không có ký tự hay index cụ thể, nó biểu thị một thao tác rỗng (NoOp) do bị triệt tiêu

# Payload tự động ép kiểu thông qua trường op_type
OpPayload = Annotated[
    Union[InsertOperation, DeleteOperation, RetainOperation], 
    Field(discriminator='op_type')
]
