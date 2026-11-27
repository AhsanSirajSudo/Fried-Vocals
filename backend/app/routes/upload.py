
from fastapi import APIRouter, UploadFile, File, HTTPException
from pathlib import Path
import uuid

router = APIRouter()

# Upload directory
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Maximum upload size: 50 MB
MAX_FILE_SIZE = 50 * 1024 * 1024

# Supported audio formats
ALLOWED_FORMATS = {
    ".mp3",
    ".wav",
    ".m4a",
    ".flac",
    ".aac",
    ".ogg",
    ".wma"
}


@router.post("/upload")
async def upload_audio(file: UploadFile = File(...)):

    # Check file extension
    extension = Path(file.filename or "").suffix.lower()

    if extension not in ALLOWED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported audio format. Supported formats: MP3, WAV, M4A, FLAC, AAC, OGG, WMA."
        )

    # Generate unique audio ID
    audio_id = str(uuid.uuid4())

    # Preserve the original extension
    file_path = UPLOAD_DIR / f"{audio_id}{extension}"

    file_size = 0

    try:
        with file_path.open("wb") as buffer:

            while chunk := await file.read(1024 * 1024):

                file_size += len(chunk)

                if file_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="File exceeds the 50 MB upload limit."
                    )

                buffer.write(chunk)

    except Exception:
        file_path.unlink(missing_ok=True)
        raise

    finally:
        await file.close()

    return {
        "success": True,
        "audio_id": audio_id,
        "filename": file.filename,
        "format": extension[1:],
        "size_bytes": file_size,
        "message": "Audio uploaded successfully."
    }
