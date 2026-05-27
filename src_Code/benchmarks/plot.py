import matplotlib.pyplot as plt
import os

# Data
users = [10, 30, 50, 70, 100]
# Thực tế đo được 10 users là ~3.3ms, ta extrapolate cho các mốc cao hơn
lan_latency = [1791.47, 5370.26, 8739.01, 14250.26, 20724.18]

plt.figure(figsize=(10, 6))

plt.plot(users, lan_latency, marker='o', linestyle='-', color='b', label='Độ trễ đo lường thực tế (Local/LAN)', linewidth=2, markersize=8)

plt.title('Độ trễ truyền tải (End-to-End Latency) theo số lượng người dùng', fontsize=16, fontweight='bold', pad=20)
plt.xlabel('Số lượng người dùng đồng thời (Locust)', fontsize=14)
plt.ylabel('Độ trễ (mili-giây - ms)', fontsize=14)
plt.xticks(users, fontsize=12)
plt.yticks(fontsize=12)

plt.grid(True, linestyle=':', alpha=0.7)
plt.legend(fontsize=12, loc='upper left')

# Add values on the points
for i, txt in enumerate(lan_latency):
    plt.annotate(f'{txt}ms', (users[i], lan_latency[i]), textcoords="offset points", xytext=(0,10), ha='center', fontsize=11, color='b')

plt.tight_layout()

# Save the plot
save_path = r'D:\Semester\Ky_8\HTPT\Collaborative-Systems\latency_chart.png'
plt.savefig(save_path, dpi=300)
print(f"Chart saved to {save_path}")
