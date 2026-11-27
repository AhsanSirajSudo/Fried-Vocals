from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="FriedVocals API",
    description="Audio processing backend for FriedVocals",
    version="1.0.0"
)

# Allow our Next.js frontend to communicate with the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
