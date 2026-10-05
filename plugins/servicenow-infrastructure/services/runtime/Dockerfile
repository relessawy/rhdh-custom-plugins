FROM registry.access.redhat.com/ubi9/python-312:latest
USER 0
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY . /opt/app-root/src/
RUN mkdir -p /data && chgrp -R 0 /data /opt/app-root/src && chmod -R g=u /data /opt/app-root/src
USER 1001
ENV HOME=/tmp PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
CMD ["python", "service.py"]
