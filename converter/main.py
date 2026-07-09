"""FastAPI conversion service for CAD/BIM formats."""

import os
import shutil
import subprocess
import tempfile
from collections.abc import Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from starlette.background import BackgroundTask

from dxf_to_ifc import convert_dxf_to_ifc
from ifc_to_dxf import convert_ifc_to_dxf


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Validate required tools on startup."""
    missing = []
    for tool in ["IfcConvert", "dwg2dxf", "dxf2dwg"]:
        if shutil.which(tool) is None:
            missing.append(tool)
    if missing:
        print(f"WARNING: Missing conversion tools: {', '.join(missing)}")
    yield


app = FastAPI(title="CAD/BIM Converter", lifespan=lifespan)

JWW_CONVERTER_URL: Optional[str] = os.environ.get("JWW_CONVERTER_URL")


def _write_upload(upload: UploadFile, dest: Path) -> None:
    with open(dest, "wb") as f:
        for chunk in upload.file:
            f.write(chunk)


def _convert_response(
    file: UploadFile,
    output_name: str,
    media_type: str,
    convert: Callable[[Path, Path], None],
) -> FileResponse:
    """Run a conversion and stream the result.

    Uses a manually-managed temp dir cleaned up by a background task *after* the
    response has been streamed. A `with TemporaryDirectory()` block would delete
    the file before FileResponse gets a chance to send it.
    """
    tmp = tempfile.mkdtemp(prefix="cadconv_")
    cleanup = BackgroundTask(shutil.rmtree, tmp, ignore_errors=True)
    try:
        input_path = Path(tmp) / (file.filename or "input")
        output_path = Path(tmp) / output_name
        _write_upload(file, input_path)
        convert(input_path, output_path)
        if not output_path.exists() or output_path.stat().st_size == 0:
            raise RuntimeError("Conversion produced no output")
    except HTTPException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(tmp, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return FileResponse(
        output_path, media_type=media_type, filename=output_name, background=cleanup
    )


def _run_cmd(cmd: list[str]) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or "Conversion command failed")


def _convert_dwg_to_dxf(input_path: Path, output_path: Path) -> None:
    _run_cmd(["dwg2dxf", "-y", "-o", str(output_path), str(input_path)])


def _convert_dxf_to_dwg(input_path: Path, output_path: Path) -> None:
    _run_cmd(["dxf2dwg", "-y", "-o", str(output_path), str(input_path)])


def _convert_ifc_to_dwg(input_path: Path, output_path: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        dxf_path = Path(tmp) / "intermediate.dxf"
        convert_ifc_to_dxf(input_path, dxf_path)
        _convert_dxf_to_dwg(dxf_path, output_path)


def _convert_dwg_to_ifc(input_path: Path, output_path: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        dxf_path = Path(tmp) / "intermediate.dxf"
        _convert_dwg_to_dxf(input_path, dxf_path)
        convert_dxf_to_ifc(dxf_path, output_path)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/convert/ifc-to-dxf")
async def ifc_to_dxf(file: UploadFile = File(...)) -> FileResponse:
    return _convert_response(file, "output.dxf", "application/dxf", convert_ifc_to_dxf)


@app.post("/convert/ifc-to-dwg")
async def ifc_to_dwg(file: UploadFile = File(...)) -> FileResponse:
    return _convert_response(file, "output.dwg", "application/dwg", _convert_ifc_to_dwg)


@app.post("/convert/dwg-to-dxf")
async def dwg_to_dxf(file: UploadFile = File(...)) -> FileResponse:
    return _convert_response(file, "output.dxf", "application/dxf", _convert_dwg_to_dxf)


@app.post("/convert/dxf-to-ifc")
async def dxf_to_ifc(file: UploadFile = File(...)) -> FileResponse:
    return _convert_response(file, "output.ifc", "application/x-step", convert_dxf_to_ifc)


@app.post("/convert/dwg-to-ifc")
async def dwg_to_ifc(file: UploadFile = File(...)) -> FileResponse:
    return _convert_response(file, "output.ifc", "application/x-step", _convert_dwg_to_ifc)


@app.post("/convert/jww-to-dxf")
async def jww_to_dxf(file: UploadFile = File(...)) -> FileResponse:
    if not JWW_CONVERTER_URL:
        raise HTTPException(status_code=501, detail="JWW converter not configured")
    # Proxy to external JWW conversion service if available.
    raise HTTPException(status_code=501, detail="JWW external conversion not yet implemented")


@app.post("/convert/jww-to-dwg")
async def jww_to_dwg(file: UploadFile = File(...)) -> FileResponse:
    if not JWW_CONVERTER_URL:
        raise HTTPException(status_code=501, detail="JWW converter not configured")
    raise HTTPException(status_code=501, detail="JWW external conversion not yet implemented")


@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    return JSONResponse(status_code=500, content={"error": str(exc)})
