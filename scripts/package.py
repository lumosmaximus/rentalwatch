"""Create a source-only ZIP without credentials, downloaded pages or dependencies."""
from pathlib import Path
import os
import zipfile

root = Path(__file__).resolve().parent.parent
target = root.parent / "RentalWatch.zip"
excluded = {"node_modules", ".next", ".local", ".git", "test-results", "__pycache__"}
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
    for directory, directories, filenames in os.walk(root):
        directories[:] = [name for name in directories if name not in excluded]
        for name in filenames:
            if (name.startswith(".env") and name != ".env.example") or name.endswith(".tsbuildinfo"):
                continue
            path = Path(directory) / name
            archive.write(path, Path("rental-tracker") / path.relative_to(root))
print(f"Packaged source: {target}")
