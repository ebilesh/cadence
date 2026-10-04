"""Copy the current build and Python report into the saved demo folder."""
from pathlib import Path
import shutil

root=Path(__file__).resolve().parents[1]
source=root/'frontend'/'dist'
target=root/'demo'
if not (source/'index.html').exists(): raise SystemExit('Build the frontend first with npm run build.')
# Clear old hashed assets so the committed demo does not grow after each build.
assets=(target/'assets').resolve()
if not assets.is_relative_to(root.resolve()): raise SystemExit('The asset folder is outside the project.')
if assets.exists(): shutil.rmtree(assets)
shutil.copytree(source,target,dirs_exist_ok=True)
shutil.copy2(root/'frontend'/'src'/'demo.json',target/'report.json')
print('Saved demo updated.')
