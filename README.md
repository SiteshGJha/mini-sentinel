# Mini-Sentinel: Financial AI Governance & PII Redaction Gateway

Mini-Sentinel is a high-performance financial AI governance gateway designed to intercept tool requests, evaluate compliance rules, and dynamically detect and redact PII. 

The application utilizes an **asynchronous job processing model** backed by Redis to keep gateway latency sub-millisecond, and delegates advanced Natural Language Processing (NLP) PII scanning to a dedicated Python-Presidio microservice over a native TCP socket protocol.

---

## System Architecture

The ecosystem consists of three major services:
1. **NestJS API Gateway & Worker**: Serves incoming HTTP API requests, queues jobs, and executes the asynchronous verification pipeline.
2. **Python Presidio TCP Microservice**: Runs Microsoft Presidio and spaCy NLP engines to scan, identify, and mask sensitive PII fields.
3. **Redis & PostgreSQL**: Manages task queues (`brpop`/`lpush`) and persists cryptographic audit logs.

```mermaid
sequenceDiagram
  autonumber
  actor User as Client Application
  participant GW as NestJS Gateway
  participant DB as PostgreSQL
  participant RD as Redis Queue
  participant WK as Background Worker
  participant PY as Python TCP Service

  User->>GW: POST /api/v1/intercept
  GW->>DB: Insert initial AuditRecord (PENDING)
  GW->>RD: Enqueue Job ID (LPUSH)
  GW-->>User: Return 202 Accepted (Request ID)

  Note over WK, RD: Worker polls Redis via BRPOP
  RD-->>WK: Dequeue Job ID
  WK->>DB: Fetch raw parameters
  
  Note over WK, PY: TCP Handshake (Port 50051)
  WK->>PY: Send raw request parameters + \n
  PY->>PY: Walk parameters, scan & redact PII via Presidio/spaCy
  PY->>WK: Return redacted parameters + \n
  Note over WK, PY: TCP Connection Closed

  WK->>WK: Evaluate Compliance Rules & Tool execution
  WK->>DB: Update AuditRecord with verdict (APPROVED/BLOCKED) & recalculate block hashes
  WK->>User: (Optional) Dispatch Webhook / Polling yields 200 Verdict
```

---

## Core Components

### 1. Asynchronous Queue Processing
* Incoming requests to `/api/v1/intercept` are validated and saved as `PENDING` before being queued in Redis.
* A background `JobWorkerService` pops jobs using blocking pops (`brpop`) to run the CPU-intensive PII redaction and compliance rules check outside the main request-response thread.

### 2. Custom Python-Presidio TCP Service (`pii-service`)
* To avoid the heavy network and library overhead of gRPC or HTTP, NestJS communicates with Python over a raw stream TCP socket on port `50051`.
* Built on `asyncio.streams`, it parses incoming newline-terminated JSON strings.
* It leverages Microsoft Presidio to detect `SSN`, `CREDIT_CARD`, `BANK_ACCOUNT`, `EMAIL`, `PHONE`, `ADDRESS`, and `PERSON` entities using the optimized `en_core_web_sm` model.
* It includes a fallback mechanism: if the microservice is offline, the NestJS gateway falls back to local regex-based heuristics.

### 3. Cryptographic Audit Chain
* Every validation verdict is persisted as an `AuditRecord` in PostgreSQL.
* Each record acts as a block in a ledger, containing a hash (`SHA-256`) of its own data combined with the hash of the *previous* record.
* Any recalculation or manual override sequentially updates the hash chain to maintain strict cryptographic integrity.

---

## Getting Started

### Prerequisites
* Docker & Docker Compose
* Node.js v18+ & npm

### Running Locally (Step-by-Step)

#### Step 1: Start PostgreSQL & Redis (Local Databases)
We will spin up PostgreSQL and Redis using Docker Compose, but leave the Python and Node services to run directly on your host machine:
```bash
# Start only the database and queue services
docker compose up -d postgres redis
```
You can verify they are healthy by running:
```bash
docker compose ps
```

#### Step 2: Start the Python PII Microservice
Run the Python TCP socket server on your local machine:
1. Create and activate a virtual environment (recommended):
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r pii-service/requirements.txt
   ```
3. Download the required spaCy model:
   ```bash
   python3 -m spacy download en_core_web_sm
   ```
4. Run the server:
   ```bash
   python3 pii-service/server.py
   ```
   *You will see the output:* `INFO:pii-service:Serving PII Redaction TCP socket service on ('0.0.0.0', 50051)`

#### Step 3: Start the NestJS API Gateway & Background Worker
This process will run the HTTP endpoints and start the Redis background job worker in the same process:
1. Install Node dependencies (run from the root directory):
   ```bash
   npm install
   ```
2. Push the database schema to your local PostgreSQL container:
   ```bash
   npx prisma db push --schema=apps/api/prisma/schema.prisma
   ```
3. Start the NestJS dev server:
   ```bash
   npm run api:dev
   ```
   *The API will start listening on port `3000` and connect to the local Redis queue.*

#### Step 4: Start the Next.js Web Dashboard
Run the frontend dashboard UI locally:
1. Start the Next.js dev server (run from the root directory):
   ```bash
   npm run web:dev
   ```
   *The Next.js dashboard will start and listen on `http://localhost:3001`.*

#### Summary of Running Local Ports:
* **NestJS Gateway API**: `http://localhost:3000`
* **Next.js Dashboard**: `http://localhost:3001`
* **Python TCP Service**: `localhost:50051` (Socket protocol)
* **PostgreSQL**: `localhost:5433` (Dockerized)
* **Redis**: `localhost:6379` (Dockerized)

---

## Running Tests

### Unit & Property-Based Tests
Unit tests run locally without database or docker dependencies (leveraging the local PII fallback path):
```bash
npm run test
```

### End-to-End Tests
E2E tests verify the complete asynchronous intercept loop, database connectivity, and Redis queueing:
```bash
DATABASE_URL="postgresql://sentinel_user:sentinel_password@localhost:5433/sentinel_db?schema=public" npm run test:e2e
```



