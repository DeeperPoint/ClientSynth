from __future__ import annotations

import io
import os
import re
from typing import List, Tuple

from google.oauth2 import service_account
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload


SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
]


def _extract_folder_id(url_or_id: str) -> str:
    # Accept raw ID or URL like https://drive.google.com/drive/folders/<id>
    m = re.search(r"/folders/([^/?#]+)", url_or_id)
    if m:
        return m.group(1)
    return url_or_id


class GoogleDriveClient:
    def __init__(self, credentials_file: str | None = None):
        creds = None
        if credentials_file and os.path.exists(credentials_file):
            creds = service_account.Credentials.from_service_account_file(credentials_file, scopes=SCOPES)
        else:
            # Try ADC (Application Default Credentials)
            try:
                from google.auth import default as google_auth_default

                creds, _ = google_auth_default(scopes=SCOPES)
            except Exception as _:
                pass

        if creds is None:
            raise RuntimeError("Google Drive credentials not configured. Set GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE or use ADC.")
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
        self.service = build("drive", "v3", credentials=creds, cache_discovery=False)

    def list_image_files(self, folder_url_or_id: str) -> List[dict]:
        folder_id = _extract_folder_id(folder_url_or_id)
        q = f"'{folder_id}' in parents and mimeType contains 'image/' and trashed = false"
        files: List[dict] = []
        page_token = None
        while True:
            resp = self.service.files().list(
                q=q,
                fields="nextPageToken, files(id, name, mimeType)",
                pageSize=1000,
                pageToken=page_token,
            ).execute()
            files.extend(resp.get("files", []))
            page_token = resp.get("nextPageToken")
            if not page_token:
                break
        # Maintain listing order as returned (Google Drive sorts by name by default); could enforce by name
        files.sort(key=lambda f: f.get("name", ""))
        return files

    def download_file(self, file_id: str) -> Tuple[bytes, str]:
        request = self.service.files().get_media(fileId=file_id)
        buf = io.BytesIO()
        downloader = MediaIoBaseDownload(buf, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        buf.seek(0)
        # Get contentType from file metadata
        meta = self.service.files().get(fileId=file_id, fields="id, mimeType").execute()
        content_type = meta.get("mimeType", "application/octet-stream")
        return buf.getvalue(), content_type
