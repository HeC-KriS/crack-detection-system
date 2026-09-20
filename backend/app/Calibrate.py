import cv2, math

STREAM = '0'   # same value as your camera's stream_url
src = int(STREAM) if STREAM.isdigit() else STREAM

cap = cv2.VideoCapture(0)
for _ in range(10):          # skip a few frames so we get a fresh one
    ok, frame = cap.read()
cap.release()
assert ok, "Could not read from camera"

h, w = frame.shape[:2]
print(f"Frame size: {w}x{h}")

points = []
def on_click(event, x, y, flags, param):
    if event == cv2.EVENT_LBUTTONDOWN and len(points) < 2:
        points.append((x, y))
        cv2.circle(frame, (x, y), 4, (0, 0, 255), -1)
        cv2.imshow("calibrate", frame)

cv2.namedWindow("calibrate", cv2.WINDOW_NORMAL)
cv2.resizeWindow("calibrate", min(w, 1200), int(min(w, 1200) * h / w))
cv2.setMouseCallback("calibrate", on_click)
cv2.imshow("calibrate", frame)
print("Click two points on the ruler, then press any key.")
cv2.waitKey(0)
cv2.destroyAllWindows()

(x1, y1), (x2, y2) = points
pixels = math.hypot(x2 - x1, y2 - y1)
real_mm = float(input("Real distance between the two points (mm): "))
print(f"mm_per_pixel = {real_mm / pixels:.4f}")