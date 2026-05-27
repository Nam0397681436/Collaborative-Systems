import asyncio
import websockets
import json
import time
import uuid

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
                    "op": {"type": "insert", "char": "A", "index": 0},
                    "version": 0,
                    "v_clock": {},
                    "epoch": 0
                }
                
                await ws.send(json.dumps(edit_payload))
                
                # Wait for the broadcast EDIT event
                while True:
                    try:
                        resp = await asyncio.wait_for(ws.recv(), timeout=10.0)
                        data = json.loads(resp)
                        if data.get("type") == "EDIT" and data.get("user_id") == user_id:
                            latency = (time.time() - start_time) * 1000
                            latencies.append(latency)
                            break
                    except Exception as e:
                        print(f"User {user_index} error waiting for EDIT: {e}")
                        break
                        
            return sum(latencies) / len(latencies) if latencies else 0
            
    except Exception as e:
        print(f"Error user {user_index}: {e}")
        return 0

async def run_benchmark_for_users(num_users):
    doc_id = "64e1c2b5d0b4b21b0f0b4d45"
    tasks = [simulate_user(doc_id, i) for i in range(num_users)]
    start = time.time()
    results = await asyncio.gather(*tasks)
    total_time = time.time() - start
    
    valid_results = [r for r in results if r > 0]
    avg_latency = sum(valid_results) / len(valid_results) if valid_results else 0
    
    # Lưu vào file JSON cục bộ
    output_data = {
        "num_users": num_users,
        "total_time_seconds": total_time,
        "average_latency_ms": avg_latency,
        "user_latencies_ms": results
    }
    with open(f"results_{num_users}_users.json", "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=4)
        
    print(f"Users: {num_users} | Avg Latency: {avg_latency:.2f} ms | Time taken: {total_time:.2f}s | Saved to results_{num_users}_users.json")
    return avg_latency

async def main():
    users_list = [10, 30, 50, 70, 100]
    results_map = {}
    
    for u in users_list:
        print(f"Running benchmark for {u} users...")
        avg_lat = await run_benchmark_for_users(u)
        results_map[u] = avg_lat
        await asyncio.sleep(2) # cool down
        
    print("Final Results:", results_map)
    
    # Ghi đè vào file plot.py
    with open("../plot.py", "r", encoding="utf-8") as f:
        content = f.read()
    
    import re
    lat_list_str = str([round(results_map[u], 2) for u in users_list])
    new_content = re.sub(r'lan_latency = \[.*?\]', f'lan_latency = {lat_list_str}', content)
    
    with open("../plot.py", "w", encoding="utf-8") as f:
        f.write(new_content)
        
    print("plot.py updated with real values.")

if __name__ == "__main__":
    asyncio.run(main())
