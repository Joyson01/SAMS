# Anonymous photo detection

## Purpose
Show visible face locations, including small back-row faces, without identifying people or recording attendance.

## Evidence
A read-only test of the supplied 960 by 1280 image returned five boxes with the existing photo configuration. A diagnostic detection-only run retained the back-row face and returned six boxes. This establishes a size-filter failure for that face, not complete detection accuracy for the scene.

## Approach
Add a separate anonymous photo detection endpoint and upload view. Return bounding boxes, detection confidence, image dimensions, and a count. Label small detections for visual review. Do not load student profiles, generate recognition embeddings, return identity candidates, or write attendance. Preserve existing recognition behavior.

Changing the shared recognition detector would affect biometric identification and is outside this work. A separate person-body model could also detect occupants facing away, but needs separate evaluation and is outside this small face-detection change.

## Verification
Test the anonymous response contract, small-face retention, invalid uploads, and the supplied back-row example. Confirm the anonymous path does not call recognition or attendance services. Keep personal example images out of Git. Do not claim every person will be detected.

## Status
Approved and implemented. Open `/anonymous-detection` or use Anonymous Detection in the sidebar. The separate endpoint is `POST /api/v1/detection/photo`. Animated images are rejected so boxes always refer to the displayed still.
