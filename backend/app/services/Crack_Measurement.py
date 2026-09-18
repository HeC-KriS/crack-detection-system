from __future__ import annotations

import cv2
import numpy as np
from dataclasses import dataclass
import math
from skan import Skeleton, summarize
@dataclass
class CrackMeasurement:
    area_px: float
    length_px: float
    average_width_px: float
    max_width_px: float

    area_mm2: float | None = None
    length_mm: float | None = None
    average_width_mm: float | None = None
    max_width_mm: float | None = None


def clean_mask(mask: np.ndarray) -> np.ndarray:
    
    
    binary = np.where(mask > 0, 255, 0).astype(np.uint8)

    # Small kernel for removing tiny noise and closing small gaps
    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE,
        (3, 3)
    )

    # Close small gaps in the crack
    binary = cv2.morphologyEx(
        binary,
        cv2.MORPH_CLOSE,
        kernel
    )

    return binary


def calculate_area(mask: np.ndarray) -> float:
    """
    Calculate crack area in pixels.
    """

    binary = np.where(mask > 0, 255, 0).astype(np.uint8)

    return float(cv2.countNonZero(binary))


def skeletonize(mask: np.ndarray) -> np.ndarray:
    """
    Skeletonize a binary mask using morphological operations.

    
    """

    binary = np.where(mask > 0, 255, 0).astype(np.uint8)

    skeleton = cv2.ximgproc.thinning(binary)

    return skeleton


def calculate_skeleton_length(skeleton: np.ndarray) -> float:
    """
    Calculate the approximate length of a skeleton in pixels.

    Horizontal/vertical neighboring pixels contribute 1 pixel.
    Diagonal neighboring pixels contribute sqrt(2) pixels.
    """
    binary = skeleton > 0
    Skele_data = summarize(Skeleton(binary))
    length = Skele_data['branch-distance'].sum()

    return float(length)

def calculate_widths(
    mask: np.ndarray,
    skeleton: np.ndarray
) -> tuple[float, float]:
    """
    Estimate crack width using the distance transform.

    """

    binary = np.where(mask > 0, 255, 0).astype(np.uint8)

    # Distance of every crack pixel from the nearest background pixel
    distance = cv2.distanceTransform(
        binary,
        cv2.DIST_L2,
        5
    )

    skeleton_pixels = skeleton > 0

    if not np.any(skeleton_pixels):
        return 0.0, 0.0

    # Distance transform gives radius from centerline to boundary.
    # Therefore width ≈ 2 * radius.
    widths = 2.0 * distance[skeleton_pixels]

    return (
        float(np.mean(widths)),
        float(np.max(widths))
    )


def measure_crack(mask: np.ndarray,mm_per_pixel: float | None = None) -> CrackMeasurement:
    

    cleaned_mask = clean_mask(mask)

    area = calculate_area(cleaned_mask)

    skeleton = skeletonize(cleaned_mask)

    length = calculate_skeleton_length(skeleton)

    average_width, max_width = calculate_widths(
        cleaned_mask,
        skeleton
    )
    if mm_per_pixel != None:
        area_mm = area*mm_per_pixel
        leng_mm = length*mm_per_pixel
        maxwidth_mm = max_width*mm_per_pixel
        avgwidth__mm = average_width*mm_per_pixel

    return CrackMeasurement(
        area_px=area,
        length_px=length,
        average_width_px=average_width,
        max_width_px=max_width,

        area_mm2=area_mm,
        length_mm=leng_mm,
        max_width_mm=maxwidth_mm,
        average_width_mm= avgwidth__mm
    )