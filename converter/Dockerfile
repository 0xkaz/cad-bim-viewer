# CAD/BIM conversion worker
# Provides IFC/DXF/DWG conversion endpoints via FastAPI (geometry-only).
# JWW endpoints are stubs that return HTTP 501 (not implemented).
#
# Build for linux/amd64 (conda-forge has no linux-aarch64 build of libredwg):
#   docker build --platform linux/amd64 -t cad-bim-converter .
FROM --platform=linux/amd64 continuumio/miniconda3:latest

WORKDIR /app
SHELL ["/bin/bash", "-c"]

# Use the fast libmamba solver (the classic solver is extremely slow/flaky here).
RUN conda install -n base -y conda-libmamba-solver && \
    conda config --set solver libmamba

# The conversion engines are standalone CLIs invoked via subprocess, so they do not
# need to share one environment. ifcopenshell (Python module + IfcConvert) and libredwg
# cannot co-resolve in a single env, so install each in its own env and expose the
# binaries on PATH. Python is pinned to 3.11 (base image ships 3.13, unsupported).
RUN conda create -y -n app -c conda-forge python=3.11 ifcopenshell && conda clean -afy
RUN conda create -y -n dwg -c conda-forge libredwg && conda clean -afy
RUN ln -sf /opt/conda/envs/app/bin/IfcConvert /usr/local/bin/IfcConvert && \
    ln -sf /opt/conda/envs/dwg/bin/dwg2dxf  /usr/local/bin/dwg2dxf && \
    ln -sf /opt/conda/envs/dwg/bin/dxf2dwg  /usr/local/bin/dxf2dwg

COPY requirements.txt .
RUN /opt/conda/envs/app/bin/pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080

CMD ["/opt/conda/envs/app/bin/uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
