import numpy as np

def rms(values):
    arr = np.array(values, dtype=float)
    return float(np.sqrt(np.mean(arr ** 2)))

def variance(values):
    arr = np.array(values, dtype=float)
    return float(np.var(arr))

def mean(values):
    arr = np.array(values, dtype=float)
    return float(np.mean(arr))

def peak(values):
    arr = np.array(values, dtype=float)
    return float(np.max(np.abs(arr)))

def build_features(readings):
    x = [r["vibrationX"] for r in readings]
    y = [r["vibrationY"] for r in readings]
    z = [r["vibrationZ"] for r in readings]
    t = [r["temperature"] for r in readings]
    s = [r["speed"] for r in readings]
    n = [r["noiseLevel"] for r in readings]

    return {
        "rmsX": rms(x),
        "rmsY": rms(y),
        "rmsZ": rms(z),
        "meanX": mean(x),
        "meanY": mean(y),
        "meanZ": mean(z),
        "varianceX": variance(x),
        "varianceY": variance(y),
        "varianceZ": variance(z),
        "vibrationPeak": max(peak(x), peak(y), peak(z)),
        "tempMean": mean(t),
        "speedMean": mean(s),
        "noiseMean": mean(n)
    }