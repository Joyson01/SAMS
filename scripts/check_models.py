"""Verify real InsightFace buffalo_l detection and 512-dimensional embeddings."""
import sys


def main():
    try:
        from insightface.app import FaceAnalysis
        from insightface.data import get_image
        app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        app.prepare(ctx_id=-1, det_size=(640, 640))
        faces = app.get(get_image('t1'))
        print(f"Face count: {len(faces)}")
        assert faces, "No faces detected in InsightFace sample t1"
        for face in faces:
            print(f"Embedding shape: {face.normed_embedding.shape}")
            assert face.normed_embedding.shape == (512,)
        for name, model in app.models.items():
            print(f"{name} ONNX providers: {model.session.get_providers()}")
    except Exception as exc:
        print(f"AI engine unavailable: {exc}", file=sys.stderr)
        print("Manual install: obtain buffalo_l.zip from the official InsightFace model release "
              "https://github.com/deepinsight/insightface/releases/tag/v0.7 and extract the ONNX "
              "files into ~/.insightface/models/buffalo_l/ (including det_10g.onnx and w600k_r50.onnx). "
              "Then rerun python -m scripts.check_models.", file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
