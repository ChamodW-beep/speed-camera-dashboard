"""Turning pixels on the picture into metres on the road (homography)."""
from typing import List, Optional, Tuple

import cv2
import numpy as np


def order_points(points) -> np.ndarray:
    """Return the 4 points as far-left, far-right, near-right, near-left.

    The two points highest in the picture are the far line, the two lowest are
    the near line. This means the order the user clicked in does not matter.
    """
    pts = np.array(points, dtype=np.float64).reshape(4, 2)
    by_y = np.argsort(pts[:, 1])
    far = pts[by_y[:2]]
    near = pts[by_y[2:]]
    far = far[np.argsort(far[:, 0])]
    near = near[np.argsort(near[:, 0])]
    return np.array([far[0], far[1], near[1], near[0]])


def validate_quad(points_norm) -> Optional[str]:
    """Return a plain-language problem with the 4 points, or None if they are fine."""
    try:
        pts = np.array(points_norm, dtype=np.float64).reshape(4, 2)
    except (ValueError, TypeError):
        return "Mark exactly 4 points on the road."
    if not np.all((pts >= 0) & (pts <= 1)):
        return "The points must be inside the picture."
    ordered = order_points(pts)
    contour = (ordered * 1000).astype(np.int32).reshape(-1, 1, 2)
    area = cv2.contourArea(contour) / 1_000_000
    if area < 0.01:
        return "The four points cover too little of the picture. Spread them further apart."
    if not cv2.isContourConvex(contour):
        return "The four points cross over each other. Mark the corners of a rectangle on the road."
    return None


def road_homography(points_norm, frame_w: int, frame_h: int, width_m: float, length_m: float) -> np.ndarray:
    """3x3 matrix that converts picture pixels into road metres.

    Road coordinates: X runs across the road (0 to width_m), Y runs along it
    (0 at the far line, length_m at the near line).
    """
    pix = order_points(points_norm) * np.array([frame_w, frame_h], dtype=np.float64)
    real = np.array(
        [[0, 0], [width_m, 0], [width_m, length_m], [0, length_m]], dtype=np.float64
    )
    return cv2.getPerspectiveTransform(pix.astype(np.float32), real.astype(np.float32))


def to_ground(M: np.ndarray, x: float, y: float) -> Tuple[float, float]:
    p = cv2.perspectiveTransform(np.array([[[x, y]]], dtype=np.float32), M)[0][0]
    return float(p[0]), float(p[1])


def metres_per_pixel(M: np.ndarray, cx: float, cy: float) -> float:
    """Roughly how many metres one pixel is worth at the given picture position."""
    x0, y0 = to_ground(M, cx, cy)
    x1, y1 = to_ground(M, cx + 1, cy)
    x2, y2 = to_ground(M, cx, cy + 1)
    return float((np.hypot(x1 - x0, y1 - y0) + np.hypot(x2 - x0, y2 - y0)) / 2)


def quad_centre(points_norm, frame_w: int, frame_h: int) -> Tuple[float, float]:
    pts = order_points(points_norm) * np.array([frame_w, frame_h], dtype=np.float64)
    c = pts.mean(axis=0)
    return float(c[0]), float(c[1])


def birdseye(frame: np.ndarray, M: np.ndarray, width_m: float, length_m: float,
             px_per_m: Optional[float] = None) -> np.ndarray:
    """Top-down view of the road from the calibration. Straight lane lines that
    come out parallel mean the calibration is good."""
    x_min, x_max = -width_m * 0.5, width_m * 1.5
    y_min, y_max = -length_m * 0.6, length_m * 1.6
    span_x, span_y = x_max - x_min, y_max - y_min
    if px_per_m is None:
        px_per_m = min(900.0 / span_x, 900.0 / span_y)
    out_w, out_h = int(span_x * px_per_m), int(span_y * px_per_m)
    shift = np.array(
        [[px_per_m, 0, -x_min * px_per_m], [0, px_per_m, -y_min * px_per_m], [0, 0, 1]],
        dtype=np.float64,
    )
    return cv2.warpPerspective(frame, shift @ M, (out_w, out_h), flags=cv2.INTER_LINEAR)
