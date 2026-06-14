import requests
import random
import time
from datetime import datetime, timezone

URL = "http://localhost:5000/api/sensors/readings"

segment_ids = ["SEG-001", "SEG-002", "SEG-003" , "SEG-004", "SEG-005"]
run_ids = ["RUN-20260610-R1", "RUN-20260610-R2", "RUN-20260611-R3" , "RUN-20260612-R4", "RUN-20260613-R5"]

while True:
    for run in run_ids:
        segment = random.choice(segment_ids)
        base = 0.8 if segment != "SEG-005" else 1.8

        payload = {
            "sensorId": "SEN-001",
            "segmentId": segment,
            "runId": run,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "vibrationX": round(random.uniform(base, base + 0.4), 3),
            "vibrationY": round(random.uniform(base, base + 0.5), 3),
            "vibrationZ": round(random.uniform(base, base + 0.3), 3),
            "temperature": round(random.uniform(30, 40), 2),
            "speed": round(random.uniform(50, 70), 2),
            "noiseLevel": round(random.uniform(65, 90), 2)
        }

        try:
            requests.post(URL, json=payload, timeout=5)
            print(f"sent {payload['segmentId']} → {payload['runId']}")
        except Exception as e:
            print("error", e)

    time.sleep(1)