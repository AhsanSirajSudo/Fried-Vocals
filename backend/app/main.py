from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.upload import router as upload_router

app = FastAPI(
    title="FriedVocals API",
    description="Audio processing backend for FriedVocals",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register upload routes
app.include_router(upload_router)


@app.get("/")
def home():
    return {
        "message": "Welcome to FriedVocals API"
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "FriedVocals Backend"
    }
