from dataclasses import dataclass
from typing import Protocol
import numpy as np

@dataclass
class DetectedFace:
    box: tuple[int,int,int,int]
    embedding: np.ndarray
    quality: float

class RecognitionEngine(Protocol):
    def analyze(self, image_bytes: bytes) -> list[DetectedFace]: ...
