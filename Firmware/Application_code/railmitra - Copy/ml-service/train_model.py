import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
import joblib
import os

np.random.seed(42)

rows = []

for _ in range(250):
    rows.append([0.7, 0.8, 0.75, 0.02, 0.03, 0.02, 1.0, 34, 60, 70, "Normal"])

for _ in range(180):
    rows.append([1.3, 1.2, 1.4, 0.12, 0.10, 0.14, 2.2, 36, 58, 78, "Inspect"])

for _ in range(120):
    rows.append([2.0, 2.2, 1.9, 0.30, 0.28, 0.25, 3.5, 39, 55, 88, "Urgent"])

data = pd.DataFrame(rows, columns=[
    "rmsX","rmsY","rmsZ",
    "varianceX","varianceY","varianceZ",
    "vibrationPeak","tempMean","speedMean","noiseMean","label"
])

for col in data.columns[:-1]:
    data[col] = data[col] + np.random.normal(0, 0.08, len(data))

X = data.drop(columns=["label"])
y = data["label"]

model = RandomForestClassifier(n_estimators=150, random_state=42)
model.fit(X, y)

os.makedirs("model", exist_ok=True)
joblib.dump(model, "model/predictive_model.joblib")
print("model saved")