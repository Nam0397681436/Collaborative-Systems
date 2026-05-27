import matplotlib.pyplot as plt
import json
import os

# Data points
users = [10, 30, 50, 70, 100]

# Load Single Doc results (Hardcoded from previous successful run)
single_latencies = [1791.47, 5370.26, 8739.01, 14250.26, 20724.18]

# Load Multi Doc results
multi_latencies = []
for u in users:
    try:
        with open(f"results_multi_{u}_users.json", "r") as f:
            data = json.load(f)
            multi_latencies.append(round(data["avg_latency"], 2))
    except Exception as e:
        print(f"Missing multi data for {u}: {e}")
        multi_latencies.append(0)

print("Single Doc Latencies:", single_latencies)
print("Multi Doc Latencies:", multi_latencies)

plt.figure(figsize=(10, 6))

plt.plot(users, single_latencies, marker='o', linestyle='-', color='r', label='Single Document (1 Worker)', linewidth=2, markersize=8)
plt.plot(users, multi_latencies, marker='s', linestyle='-', color='g', label='Multi Document (2 Workers)', linewidth=2, markersize=8)

plt.title('Độ trễ truyền tải: 1 Worker vs 2 Workers', fontsize=16, fontweight='bold', pad=20)
plt.xlabel('Tổng số lượng người dùng đồng thời', fontsize=14)
plt.ylabel('Độ trễ trung bình End-to-End (mili-giây - ms)', fontsize=14)
plt.xticks(users, fontsize=12)
plt.yticks(fontsize=12)

plt.grid(True, linestyle=':', alpha=0.7)
plt.legend(fontsize=12, loc='upper left')

# Add values on the points
for i, txt in enumerate(single_latencies):
    if txt > 0:
        plt.annotate(f'{txt}ms', (users[i], single_latencies[i]), textcoords="offset points", xytext=(0,10), ha='center', fontsize=11, color='r')

for i, txt in enumerate(multi_latencies):
    if txt > 0:
        plt.annotate(f'{txt}ms', (users[i], multi_latencies[i]), textcoords="offset points", xytext=(0,-15), ha='center', fontsize=11, color='g')

plt.tight_layout()

# Save the plot
plt.savefig('multi_latency_chart.png', dpi=300, bbox_inches='tight')
print("Successfully generated multi_latency_chart.png")
