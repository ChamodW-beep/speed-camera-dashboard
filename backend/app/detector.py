"""Finding and following vehicles in a frame (YOLO + ByteTrack)."""
from typing import List, NamedTuple, Tuple

VEHICLE_CLASSES = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}
YOLO_IMAGE_SIZE = {"fast": 640, "balanced": 960, "accurate": 1280}


class Detection(NamedTuple):
    track_id: int
    box: Tuple[float, float, float, float]  # x1, y1, x2, y2 in frame pixels
    cls: str
    conf: float


class YoloDetector:
    """Wraps Ultralytics YOLO. The model is loaded here, not at import time, so the
    rest of the app (and the tests) work without PyTorch installed."""

    def __init__(self, model_name: str = "yolov8s.pt", conf: float = 0.25, quality: str = "balanced"):
        from ultralytics import YOLO  # imported late on purpose

        self.model = YOLO(model_name)
        self.conf = conf
        self.imgsz = YOLO_IMAGE_SIZE.get(quality, 960)
        self.device = self._pick_device()

    @staticmethod
    def _pick_device():
        try:
            import torch

            if torch.backends.mps.is_available():
                return "mps"
            if torch.cuda.is_available():
                return 0
        except Exception:
            pass
        return "cpu"

    def _track(self, frame, device):
        return self.model.track(
            frame,
            persist=True,
            tracker="bytetrack.yaml",
            classes=list(VEHICLE_CLASSES.keys()),
            conf=self.conf,
            imgsz=self.imgsz,
            device=device,
            verbose=False,
        )[0]

    def detect(self, frame) -> List[Detection]:
        try:
            result = self._track(frame, self.device)
        except Exception:
            if self.device == "cpu":
                raise
            self.device = "cpu"  # the accelerator failed, carry on with the CPU
            result = self._track(frame, "cpu")
        boxes = result.boxes
        if boxes is None or boxes.id is None:
            return []
        ids = boxes.id.int().cpu().tolist()
        xyxy = boxes.xyxy.cpu().numpy()
        classes = boxes.cls.int().cpu().tolist()
        confs = boxes.conf.cpu().tolist()
        out = []
        for i, tid in enumerate(ids):
            x1, y1, x2, y2 = (float(v) for v in xyxy[i])
            out.append(Detection(int(tid), (x1, y1, x2, y2),
                                 VEHICLE_CLASSES.get(classes[i], "vehicle"), float(confs[i])))
        return out
