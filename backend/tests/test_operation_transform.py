from app.models.ot_operation import InsertOperation, DeleteOperation, RetainOperation
from app.core.operation_transform import transform

def test_insert_insert_tiebreaker():
    # Cùng insert tại index 1. User A < User B -> A giữ nguyên index 1, B sẽ bị đẩy lùi nếu tính opB' = T(opB, opA).
    # Ở đây ta tính op1' = transform(op1, op2)
    opA = InsertOperation(op_type="insert", user_id="A", doc_id="doc1", v_clock={}, char="X", index=1)
    opB = InsertOperation(op_type="insert", user_id="B", doc_id="doc1", v_clock={}, char="Y", index=1)
    
    # transform(A, B): A < B -> A giữ nguyên index
    opA_prime = transform(opA, opB)
    assert opA_prime.index == 1
    
    # transform(B, A): B > A -> B bị lùi index
    opB_prime = transform(opB, opA)
    assert opB_prime.index == 2

def test_insert_insert_normal():
    # op1 insert ở vị trí trước op2 -> op1 không đổi
    op1 = InsertOperation(op_type="insert", user_id="A", doc_id="doc1", v_clock={}, char="X", index=0)
    op2 = InsertOperation(op_type="insert", user_id="B", doc_id="doc1", v_clock={}, char="Y", index=2)
    assert transform(op1, op2).index == 0
    assert transform(op2, op1).index == 3

def test_insert_delete():
    op_ins = InsertOperation(op_type="insert", user_id="A", doc_id="doc1", v_clock={}, char="X", index=2)
    op_del = DeleteOperation(op_type="delete", user_id="B", doc_id="doc1", v_clock={}, char="Y", index=1)
    # Xóa đứng trước -> Insert bị lùi 1 vị trí
    assert transform(op_ins, op_del).index == 1
    
    op_ins2 = InsertOperation(op_type="insert", user_id="A", doc_id="doc1", v_clock={}, char="X", index=0)
    # Insert đứng trước -> Insert không đổi
    assert transform(op_ins2, op_del).index == 0

def test_delete_insert():
    op_del = DeleteOperation(op_type="delete", user_id="A", doc_id="doc1", v_clock={}, char="X", index=2)
    op_ins = InsertOperation(op_type="insert", user_id="B", doc_id="doc1", v_clock={}, char="Y", index=1)
    # Insert đứng trước -> Xóa bị tiến 1 vị trí
    assert transform(op_del, op_ins).index == 3

def test_delete_delete():
    op_del1 = DeleteOperation(op_type="delete", user_id="A", doc_id="doc1", v_clock={}, char="X", index=2)
    op_del2 = DeleteOperation(op_type="delete", user_id="B", doc_id="doc1", v_clock={}, char="X", index=2)
    
    # Cùng xóa 1 vị trí -> Trở thành NoOp (Retain)
    res = transform(op_del1, op_del2)
    assert isinstance(res, RetainOperation)

    op_del3 = DeleteOperation(op_type="delete", user_id="C", doc_id="doc1", v_clock={}, char="Y", index=1)
    # Xóa ở index 1 trước -> Delete ở index 2 bị lùi về 1
    assert transform(op_del1, op_del3).index == 1
