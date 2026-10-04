import asyncio
import os
import tempfile
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from dotenv import load_dotenv
from starlette.responses import JSONResponse
from analysis import analyze, demo_events, read_audio, read_midi, read_score
from recommendations import recommend

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
app = FastAPI(title="Cadence", version="1.1.0")


class BodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            await self.app(scope, receive, send)
            return
        limit = int(os.getenv("MAX_REQUEST_MB", "22")) * 1024 * 1024
        headers = dict(scope["headers"])
        try:
            declared = int(headers.get(b"content-length", b"0"))
        except ValueError:
            declared = limit + 1
        response = JSONResponse(
            {
                "detail": f"The request is too large. Keep both files together under {limit//1024//1024} MB."
            },
            status_code=413,
        )
        if declared > limit:
            await response(scope, receive, send)
            return
        chunks = []
        size = 0
        # Count streamed bodies too, before multipart parsing can spool them to disk.
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > limit:
                await response(scope, receive, send)
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        body = b"".join(chunks)
        delivered = False

        async def bounded_receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        await self.app(scope, bounded_receive, send)


app.add_middleware(BodyLimit)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@app.get("/api/health")
def health():
    return {"status": "ok", "recommender": os.getenv("RECOMMENDER", "rules")}


@app.get("/api/demo")
async def demo(request: Request):
    return await recommend(analyze(*demo_events(), source="demo"), client_ip(request))


async def save_upload(upload: UploadFile, folder: Path, allowed: set[str]) -> Path:
    if Path(upload.filename or "").suffix.lower() not in allowed:
        raise ValueError("Unsupported file type. Choose MIDI, WAV, FLAC, or OGG.")
    path = folder / "input"
    data = await upload.read(20 * 1024 * 1024 + 1)
    if len(data) > 20 * 1024 * 1024:
        raise ValueError("This file is larger than 20 MB. Choose a smaller file.")
    path.write_bytes(data)
    return path


def analyze_files(ref: Path, perf: Path, is_midi: bool) -> dict:
    score = read_score(ref)
    audio = None if is_midi else read_audio(perf)
    events = read_midi(perf) if is_midi else audio["notes"]
    return analyze(
        score["notes"],
        events,
        "midi" if is_midi else "audio",
        score["measures"],
        audio,
        score["meter_assumed"],
    )


@app.post("/api/analyze")
async def upload(
    request: Request,
    reference: UploadFile = File(...),
    performance: UploadFile = File(...),
):
    try:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            refdir = root / "reference"
            perfdir = root / "performance"
            refdir.mkdir()
            perfdir.mkdir()
            ref = await save_upload(reference, refdir, {".mid", ".midi"})
            is_midi = Path(performance.filename or "").suffix.lower() in {
                ".mid",
                ".midi",
            }
            perf = await save_upload(
                performance,
                perfdir,
                {".mid", ".midi"} if is_midi else {".wav", ".flac", ".ogg"},
            )
            result = await asyncio.to_thread(analyze_files, ref, perf, is_midi)
        return await recommend(result, client_ip(request))
    except Exception as error:
        message = (
            str(error)
            if isinstance(error, ValueError)
            else "These files could not be read. Check their format and try a shorter passage."
        )
        raise HTTPException(status_code=422, detail=message) from error
    finally:
        await reference.close()
        await performance.close()


class Event(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    pitch: int = Field(ge=0, le=127)
    start: float = Field(ge=0, le=120)
    duration: float = Field(gt=0, le=120)


class Measure(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    number: int = Field(ge=1, le=1000)
    start: float = Field(ge=0, le=120)
    end: float = Field(gt=0, le=120)


class Capture(BaseModel):
    reference: list[Event] = Field(min_length=1, max_length=600)
    performance: list[Event] = Field(min_length=1, max_length=600)
    measures: list[Measure] | None = Field(default=None, max_length=240)
    meter_assumed: bool = False


@app.post("/api/capture")
async def capture(request: Request, data: Capture):
    try:
        bars = [bar.model_dump() for bar in data.measures] if data.measures else None
        if bars and (
            any(b["end"] <= b["start"] for b in bars)
            or any(
                a["end"] > b["start"] + 0.001 or a["number"] >= b["number"]
                for a, b in zip(bars, bars[1:])
            )
        ):
            raise ValueError(
                "The reference bars are invalid. Upload the MIDI reference again."
            )
        result = await asyncio.to_thread(
            analyze,
            [n.model_dump() for n in data.reference],
            [n.model_dump() for n in data.performance],
            "midi",
            bars,
            None,
            data.meter_assumed,
        )
        return await recommend(result, client_ip(request))
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.get("/api/reference")
def reference_events():
    notes = demo_events()[0]
    return {
        "notes": notes,
        "measures": [
            {
                "number": i + 1,
                "start": i * 2.0,
                "end": (i + 1) * 2.0 if i < 7 else 15.88,
            }
            for i in range(8)
        ],
        "meter_assumed": False,
    }


@app.post("/api/reference")
async def reference_upload(reference: UploadFile = File(...)):
    try:
        with tempfile.TemporaryDirectory() as folder:
            path = await save_upload(reference, Path(folder), {".mid", ".midi"})
            score = await asyncio.to_thread(read_score, path)
            if (
                not score["notes"]
                or len(score["notes"]) > 600
                or max(n["start"] + n["duration"] for n in score["notes"]) > 120
            ):
                raise ValueError(
                    "Use a MIDI reference with 1 to 600 notes under two minutes."
                )
            return score
    except Exception as error:
        raise HTTPException(
            status_code=422,
            detail=(
                str(error)
                if isinstance(error, ValueError)
                else "The reference MIDI could not be read. Choose another file."
            ),
        ) from error
    finally:
        await reference.close()
