FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY server/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY server/ ./
COPY public /app/public
COPY admin /app/admin

RUN mkdir -p uploads/trainers uploads/gallery uploads/general

EXPOSE 5000
CMD ["sh", "-c", "python seed.py && uvicorn app:app --host 0.0.0.0 --port 5000"]
