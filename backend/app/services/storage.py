import os
from typing import Tuple


class LocalStorage:
    def __init__(self, base_dir: str = "/tmp/clientsynth"):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)

    def save_generated(self, tenant_id: str, job_id: str, record_id: str, field_name: str, data: bytes) -> Tuple[str, str]:
        path_dir = os.path.join(self.base_dir, tenant_id, job_id, record_id)
        os.makedirs(path_dir, exist_ok=True)
        file_path = os.path.join(path_dir, f"{field_name}.png")
        with open(file_path, "wb") as f:
            f.write(data)
        url = f"file://{file_path}"
        return file_path, url


