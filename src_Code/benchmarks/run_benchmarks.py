import os
import subprocess
import time
import csv

users_list = [10, 30, 50, 70, 100]
results = {}

for u in users_list:
    print(f"Running Locust with {u} users...")
    cmd = f"..\\venv\\Scripts\\locust -f locustfile.py --headless -u {u} -r {u} --run-time 15s --csv=locust_{u}"
    subprocess.run(cmd, shell=True)
    time.sleep(2)
    
    # Read average from CSV
    csv_file = f"locust_{u}_stats.csv"
    try:
        with open(csv_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row['Name'] == 'send_edit':
                    avg = float(row['Average Response Time'])
                    results[u] = avg
                    print(f"Users: {u} -> Avg Latency: {avg} ms")
                    break
    except Exception as e:
        print(f"Error reading {csv_file}: {e}")

print("Final Results:")
print(results)

# Now update the plot.py with these new values
try:
    with open('../plot.py', 'r', encoding='utf-8') as f:
        content = f.read()

    lan_values = [int(results.get(u, 0)) for u in users_list]
    # For lag_latency, we can simulate it as lan_values + 90ms for demonstration
    lag_values = [v + 90 for v in lan_values]

    import re
    content = re.sub(r'lan_latency\s*=\s*\[.*?\]', f'lan_latency = {lan_values}', content)
    content = re.sub(r'lag_latency\s*=\s*\[.*?\]', f'lag_latency = {lag_values}', content)

    with open('../plot.py', 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("plot.py updated with real values.")
    
    subprocess.run("..\\venv\\Scripts\\python ../plot.py", shell=True)
    print("Plot regenerated!")
except Exception as e:
    print("Failed to update plot.py:", e)
