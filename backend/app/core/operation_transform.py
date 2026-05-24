from app.models.ot_operation import InsertOperation, DeleteOperation, RetainOperation, OpPayload
from typing import List

def transform(op_new: OpPayload, op_old: OpPayload) -> List[OpPayload]:
    """
    Biến đổi op_new dựa trên op_old theo chuẩn String-wise. 
    Trả về danh sách các op đã được hiệu chỉnh vị trí (có thể bị split).
    """
    if isinstance(op_new, RetainOperation):
        return [op_new]
    if isinstance(op_old, RetainOperation):
        return [op_new]

    # 1. Insert vs Insert
    if isinstance(op_new, InsertOperation) and isinstance(op_old, InsertOperation):
        if op_new.index < op_old.index:
            return [op_new]
        elif op_new.index > op_old.index:
            return [InsertOperation(**{**op_new.model_dump(), "index": op_new.index + len(op_old.char)})]
        else:
            # Tie-breaker logic cho 2 thao tác Insert cùng index
            if op_new.user_id < op_old.user_id:
                return [op_new]
            else:
                return [InsertOperation(**{**op_new.model_dump(), "index": op_new.index + len(op_old.char)})]

    # 2. Insert vs Delete
    elif isinstance(op_new, InsertOperation) and isinstance(op_old, DeleteOperation):
        if op_new.index <= op_old.index:
            return [op_new]
        elif op_new.index >= op_old.index + len(op_old.char):
            return [InsertOperation(**{**op_new.model_dump(), "index": op_new.index - len(op_old.char)})]
        else:
            # Bị nuốt chửng 1 phần -> Dời về mép trái của vùng bị xóa
            return [InsertOperation(**{**op_new.model_dump(), "index": op_old.index})]

    # 3. Delete vs Insert
    elif isinstance(op_new, DeleteOperation) and isinstance(op_old, InsertOperation):
        if op_new.index + len(op_new.char) <= op_old.index:
            return [op_new]
        elif op_new.index >= op_old.index:
            return [DeleteOperation(**{**op_new.model_dump(), "index": op_new.index + len(op_old.char)})]
        else:
            # Xảy ra Cắt xén (Splitting): Chèn vào giữa khoảng đang muốn xóa
            # Mảnh 1: từ đầu delete đến vị trí insert
            len_part1 = op_old.index - op_new.index
            part1_char = op_new.char[:len_part1]
            
            # Mảnh 2: từ vị trí insert đến hết delete
            part2_char = op_new.char[len_part1:]
            
            op1 = DeleteOperation(**{**op_new.model_dump(), "char": part1_char, "index": op_new.index})
            op2 = DeleteOperation(**{**op_new.model_dump(), "char": part2_char, "index": op_old.index + len(op_old.char)})
            return [op1, op2]

    # 4. Delete vs Delete
    elif isinstance(op_new, DeleteOperation) and isinstance(op_old, DeleteOperation):
        new_start = op_new.index
        new_end = op_new.index + len(op_new.char)
        old_start = op_old.index
        old_end = op_old.index + len(op_old.char)
        
        # Không giao nhau
        if new_end <= old_start:
            return [op_new]
        if new_start >= old_end:
            return [DeleteOperation(**{**op_new.model_dump(), "index": op_new.index - len(op_old.char)})]
            
        # Giao nhau: Tìm vùng bị trùng và số lượng ký tự cũ nằm hoàn toàn phía trước vùng mới
        overlap_start = max(new_start, old_start)
        overlap_end = min(new_end, old_end)
        
        # Ký tự nằm trước phần giao
        char_before = op_new.char[:overlap_start - new_start]
        # Ký tự nằm sau phần giao
        char_after = op_new.char[overlap_end - new_start:]
        
        new_char = char_before + char_after
        
        if len(new_char) == 0:
            # Bị xóa hoàn toàn
            return [RetainOperation(op_type="retain", user_id=op_new.user_id, doc_id=op_new.doc_id, v_clock=op_new.v_clock)]
        else:
            # Tính toán vị trí dịch chuyển: bị lùi tương ứng với số lượng ký tự mà old đã xóa nằm TRƯỚC new_start
            chars_deleted_before_new = max(0, min(new_start, old_end) - old_start)
            new_index = op_new.index - chars_deleted_before_new
            return [DeleteOperation(**{**op_new.model_dump(), "char": new_char, "index": new_index})]

    return [op_new]

import logging
def process_concurrent_operations(op_new: OpPayload, history_ops_ascending: List[OpPayload]) -> List[OpPayload]:
    """
    Xử lý OT bằng cách duyệt tuần tự qua lịch sử (cũ -> mới nhất).
    Tích hợp bộ lọc Causality Filter qua Vector Clock.
    """
    current_ops = [op_new]
    logging.info(f"OpNew: {op_new}\n---000---")
    for op_old in history_ops_ascending:
        hist_user = op_old.user_id
        hist_version = op_old.v_clock.get(hist_user, 0)
        
        new_ops = []
        for op in current_ops:
            if isinstance(op, RetainOperation):
                new_ops.append(op)
                continue
                
            client_version = op.v_clock.get(hist_user, 0)
            
            # Causality Filter: Chỉ Transform NẾU thao tác cũ là "Đồng thời"
            if hist_version > client_version:
                transformed = transform(op, op_old)
                logging.info(f"OpOld: {op_old}\n---111---")
                logging.info(f"Transformed: {transformed}\n---222---")
                new_ops.extend(transformed)
            else:
                new_ops.append(op)
                
        current_ops = new_ops
        
    # Lọc bỏ RetainOperation để tối ưu
    final_ops = [op for op in current_ops if not isinstance(op, RetainOperation)]
    
    if not final_ops and current_ops:
        # Nếu mảng rỗng do tất cả đều Retain, giữ lại 1 Retain để đại diện
        final_ops = [current_ops[0]]
        
    # Sửa lỗi Domino Tọa độ: Tự động sort mảng kết quả theo index GIẢM DẦN (từ phải qua trái)
    if final_ops and not isinstance(final_ops[0], RetainOperation):
        final_ops.sort(key=lambda x: x.index, reverse=True)
        
    return final_ops
