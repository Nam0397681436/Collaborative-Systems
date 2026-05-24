from app.models.ot_operation import InsertOperation, DeleteOperation, RetainOperation
from app.core.operation_transform import transform, process_concurrent_operations

def test_insert_insert():
    opA = InsertOperation(op_type="insert", user_id="A", doc_id="doc1", v_clock={}, char="XYZ", index=1)
    opB = InsertOperation(op_type="insert", user_id="B", doc_id="doc1", v_clock={}, char="12", index=1)
    
    # Tie-breaker: A < B -> A giữ nguyên index
    res_A = transform(opA, opB)
    assert res_A[0].index == 1
    
    # B > A -> B lùi index một đoạn bằng len(opA.char) = 3
    res_B = transform(opB, opA)
    assert res_B[0].index == 4

def test_insert_delete():
    # Insert nằm trước Delete
    op_ins1 = InsertOperation(op_type="insert", user_id="A", doc_id="doc1", v_clock={}, char="X", index=0)
    op_del1 = DeleteOperation(op_type="delete", user_id="B", doc_id="doc1", v_clock={}, char="123", index=2)
    assert transform(op_ins1, op_del1)[0].index == 0
    
    # Insert nằm hoàn toàn phía sau Delete
    op_ins2 = InsertOperation(op_type="insert", user_id="A", doc_id="doc1", v_clock={}, char="X", index=6)
    assert transform(op_ins2, op_del1)[0].index == 3 # 6 - 3 = 3
    
    # Insert lọt vào vùng bị Delete (Nuốt chửng) -> Trả về mép trái
    op_ins3 = InsertOperation(op_type="insert", user_id="A", doc_id="doc1", v_clock={}, char="X", index=3)
    assert transform(op_ins3, op_del1)[0].index == 2

def test_delete_insert_splitting():
    # Mảng ban đầu "abcdef" (0..5). Delete "cde" tại 2 (len=3). Insert "XY" tại 3 (len=2).
    # Chèn vào giữa vùng đang muốn xóa -> Gây ra Splitting
    op_del = DeleteOperation(op_type="delete", user_id="A", doc_id="doc1", v_clock={}, char="cde", index=2)
    op_ins = InsertOperation(op_type="insert", user_id="B", doc_id="doc1", v_clock={}, char="XY", index=3)
    
    res = transform(op_del, op_ins)
    assert len(res) == 2
    
    # Mảnh trái: xóa "c" tại 2
    assert res[0].op_type == "delete"
    assert res[0].char == "c"
    assert res[0].index == 2
    
    # Mảnh phải: xóa "de" tại (old.index + len(old.char)) = 3 + 2 = 5
    assert res[1].op_type == "delete"
    assert res[1].char == "de"
    assert res[1].index == 5

def test_delete_delete_overlapping():
    op_del_new = DeleteOperation(op_type="delete", user_id="A", doc_id="doc1", v_clock={}, char="abcdef", index=2)
    op_del_old = DeleteOperation(op_type="delete", user_id="B", doc_id="doc1", v_clock={}, char="cde", index=4)
    
    res = transform(op_del_new, op_del_old)
    assert len(res) == 1
    # Giao nhau ở phần "cde"
    # new_char = "ab" (trước giao) + "f" (sau giao) = "abf"
    assert res[0].char == "abf"
    # Dịch chuyển: Không có ký tự nào của old bị xóa trước new_start (2) -> index giữ nguyên
    assert res[0].index == 2

    # Test xóa hoàn toàn trùng lặp
    op_del_same1 = DeleteOperation(op_type="delete", user_id="A", doc_id="doc1", v_clock={}, char="abc", index=2)
    op_del_same2 = DeleteOperation(op_type="delete", user_id="B", doc_id="doc1", v_clock={}, char="abc", index=2)
    res2 = transform(op_del_same1, op_del_same2)
    assert len(res2) == 1
    assert isinstance(res2[0], RetainOperation)

def test_process_concurrent_operations_sorting():
    op_del = DeleteOperation(op_type="delete", user_id="A", doc_id="doc1", v_clock={"A":1, "B":0}, char="cde", index=2)
    op_ins = InsertOperation(op_type="insert", user_id="B", doc_id="doc1", v_clock={"A":0, "B":1}, char="XY", index=3)
    
    # op_ins là thao tác trong lịch sử, đồng thời với op_del (hist_version=1 > client_version=0)
    res = process_concurrent_operations(op_del, [op_ins])
    assert len(res) == 2
    # Sắp xếp giảm dần: mảnh có index 5 phải nằm trước mảnh có index 2
    assert res[0].index == 5
    assert res[1].index == 2
