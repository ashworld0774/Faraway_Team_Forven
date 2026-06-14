from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, List
import joblib
import pandas as pd
import traceback
from pathlib import Path

app = FastAPI()

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "model" / "predictive_model.joblib"

model = None
expected_order = None

try:
    print(f"Looking for model at: {MODEL_PATH}")
    print(f"Model exists: {MODEL_PATH.exists()}")
    model = joblib.load(MODEL_PATH)
    print(f"Model loaded successfully from: {MODEL_PATH}")

    if hasattr(model, "feature_names_in_"):
        expected_order = list(model.feature_names_in_)
        print("Model expected features:", expected_order)
    else:
        expected_order = [
            "rmsX", "rmsY", "rmsZ",
            "meanX", "meanY", "meanZ",
            "varianceX", "varianceY", "varianceZ",
            "vibrationPeak", "tempMean", "speedMean", "noiseMean"
        ]
        print("Fallback expected features:", expected_order)

except Exception as e:
    print(f"Model load error: {e}")
    model = None
    expected_order = None


class PredictionRequest(BaseModel):
    features: Dict[str, float]


class SensorReadingItem(BaseModel):
    vibrationX: float
    vibrationY: float
    vibrationZ: float
    temperature: float
    speed: float
    noiseLevel: float


class ExtractFeaturesRequest(BaseModel):
    readings: List[SensorReadingItem]


@app.get("/")
def root():
    return {"message": "ML service running"}


@app.get("/health")
def health():
    return {
        "modelLoaded": model is not None,
        "modelPath": str(MODEL_PATH),
        "modelExists": MODEL_PATH.exists(),
        "expectedFeatures": expected_order
    }


@app.post("/extract-features")
def extract_features(data: ExtractFeaturesRequest):
    try:
        readings = data.readings

        xs = [r.vibrationX for r in readings]
        ys = [r.vibrationY for r in readings]
        zs = [r.vibrationZ for r in readings]
        temps = [r.temperature for r in readings]
        speeds = [r.speed for r in readings]
        noises = [r.noiseLevel for r in readings]

        def mean(arr): return sum(arr) / len(arr)
        def variance(arr):
            m = mean(arr)
            return sum((x - m) ** 2 for x in arr) / len(arr)
        def rms(arr): return (sum(x ** 2 for x in arr) / len(arr)) ** 0.5

        return {
            "rmsX": rms(xs),
            "rmsY": rms(ys),
            "rmsZ": rms(zs),
            "varianceX": variance(xs),
            "varianceY": variance(ys),
            "varianceZ": variance(zs),
            "vibrationPeak": max(xs + ys + zs),
            "tempMean": mean(temps),
            "speedMean": mean(speeds),
            "noiseMean": mean(noises),
        }

    except Exception as e:
        print("extract-features error:", traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict")
def predict(data: PredictionRequest):
    try:
        if model is None:
            raise HTTPException(status_code=500, detail="Model not loaded")

        if expected_order is None:
            raise HTTPException(status_code=500, detail="Expected features not available")

        incoming_keys = list(data.features.keys())

        missing = [col for col in expected_order if col not in data.features]
        extra = [col for col in data.features if col not in expected_order]

        if missing:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Missing features",
                    "missing": missing,
                    "expected": expected_order,
                    "received": incoming_keys
                }
            )

        if extra:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Unexpected extra features",
                    "extra": extra,
                    "expected": expected_order,
                    "received": incoming_keys
                }
            )

        X = pd.DataFrame(
            [[data.features[col] for col in expected_order]],
            columns=expected_order
        )

        print("Prediction dataframe columns:", list(X.columns))
        print("Prediction dataframe values:", X.to_dict(orient="records"))

        prediction = model.predict(X)[0]

        confidence = None
        if hasattr(model, "predict_proba"):
            probs = model.predict_proba(X)[0]
            confidence = float(max(probs))

        return {
            "predictedClass": str(prediction),
            "confidence": confidence,
            "anomalyScore": None,
            "recommendedAction": "Inspect" if str(prediction).lower() != "normal" else "Normal monitoring"
        }

    except HTTPException as e:
        raise e
    except Exception as e:
        print("Prediction error:")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail={
                "message": str(e),
                "expectedFeatures": expected_order,
                "receivedFeatures": list(data.features.keys())
            }
        )