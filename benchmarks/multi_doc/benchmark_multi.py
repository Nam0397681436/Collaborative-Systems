import asyncio
import websockets
import json
import time
import uuid
import sys

async def simulate_user(doc_id, user_index):
    user_id = str(uuid.uuid4())
    uri = f"ws://localhost:8000/ws/{doc_id}/{user_id}"
    
    try:
        async with websockets.connect(uri, max_size=None) as ws:
            # Wait for initial JOIN event
            try:
                await asyncio.wait_for(ws.recv(), timeout=5.0)
            except:
                pass

            latencies = []
            for _ in range(5):
                start_time = time.time()
                edit_payload = {
                    "type": "EDIT",
                    "op": {
                        "type": "insert",
                        "char": "A",
                        "index": 0
                    },
                    "version": 0,
                    "v_clock": {},
                    "epoch": 0
                }
                
                await ws.send(json.dumps(edit_payload))
                
                # Wait for the broadcast EDIT event
                while True:
                    try:
                        resp = await asyncio.wait_for(ws.recv(), timeout=25.0)
                        data = json.loads(resp)
                        if data.get("type") == "EDIT" and data.get("user_id") == user_id:
                            latency = (time.time() - start_time) * 1000
                            latencies.append(latency)
                            break
                    except Exception as e:
                        print(f"User {user_index} error waiting for EDIT on {doc_id}: {e}")
                        break
                        
            return sum(latencies) / len(latencies) if latencies else 0
            
    except Exception as e:
        print(f"Error user {user_index} on {doc_id}: {e}")
        return 0

async def run_benchmark_for_users(num_users):
    doc_id_1 = "64e1c2b5d0b4b21b0f0b4d45" # Queue 1
    doc_id_2 = "64e1c2b5d0b4b21b0f0b4d46" # Queue 0
    
    tasks = []
    for i in range(num_users):
        # Even users go to doc 1, odd users go to doc 2
        doc_id = doc_id_1 if i % 2 == 0 else doc_id_2
        tasks.append(simulate_user(doc_id, i))
        
    start = time.time()
    results = await asyncio.gather(*tasks)
    total_time = time.time() - start
    
    valid_results = [r for r in results if r > 0]
    avg_latency = sum(valid_results) / len(valid_results) if valid_results else 0
    
    print(f"Users: {num_users} | Avg Latency: {avg_latency:.2f} ms | Time taken: {total_time:.2f}s | Valid: {len(valid_results)}")
    
    # Save to file
    with open(f"results_multi_{num_users}_users.json", "w") as f:
        json.dump({"num_users": num_users, "avg_latency": avg_latency, "total_time": total_time}, f)
        
    return avg_latency

async def main():
    user_counts = [10, 30, 50, 70, 100]
    final_results = {}
    
    for count in user_counts:
        print(f"\n--- Running multi-doc test for {count} users ---")
        avg = await run_benchmark_for_users(count)
        final_results[count] = avg
        # Cool down
        await asyncio.sleep(5)
        
    print(f"\nFinal Multi-Doc Results: {final_results}")

if __name__ == "__main__":
    asyncio.run(main())
