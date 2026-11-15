# Biometric Embeddings Storage

This directory holds local, runtime-generated NumPy `.npy` face embedding vectors (`student_embeddings.npy`).

### Security Notice:
- Face embedding files are generated locally at runtime upon student face enrollment.
- They are excluded from version control via `.gitignore`.
- Do not commit `.npy` or `.onnx` files to public source repositories.
