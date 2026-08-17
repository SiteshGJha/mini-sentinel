# Queue Transparency & Metrics Fix Product Spec

## 1. Goal Description
The purpose of this feature is to resolve data issues on the overview dashboard (specifically the NaN% display and empty handled request metrics) and introduce full transparency to the request processing lifecycle. Users should be able to see:
- Correct and persistent system metrics and verdict distribution counts (loaded from the DB).
- Real-time feedback in the Scenario Simulator when a request is in the "PENDING" queue/pool.
- Dynamic polling of the PENDING requests until they complete, ensuring the final verdict is updated in the UI.
- The active processing pool/queue of requests.

## 2. Product Sense Verification
*   **User Persona**: Compliance Officers, Developers, and System Administrators monitoring compliance gateway activity.
*   **Smallest Valuable Outcome (SVO)**: An accurate, real-time Overview Dashboard with correct metric values and a Simulator that polls status and displays the active queue pool.
*   **Success Metrics**:
    *   Zero NaN% occurrences on the overview dashboard.
    *   Immediate UI feedback of queue status (active vs idle) and current request state.
*   **Assumptions & Risks**:
    *   *Assumption*: Postgres is the single source of truth for metrics history.
    *   *Risk*: High frequency polling could add load; mitigated by a 1.5s interval and polling only active PENDING requests.

## 3. User Stories & Acceptance Criteria
*   **Story 1**: As an Administrator, I want to view accurate metrics and verdict distributions on the overview dashboard, so that I can monitor compliance rates and performance.
    *   *Acceptance Criteria*:
        - Total handled requests shows database records count.
        - Block and escalation rates calculate correctly, showing 0% (instead of NaN%) when total requests is 0.
        - Verdict outcome distribution shows the actual number and correct percentage of approved, blocked, and escalated requests.
*   **Story 2**: As a Developer simulating requests, I want to see the real-time status of enqueued requests and the active request pool, so that I have visibility into background worker execution.
    *   *Acceptance Criteria*:
        - Submitting a request in the Simulator starts polling the status endpoint until the verdict is final (not PENDING).
        - An "Active Processing Pool" panel displays a list of currently pending requests.
        - The sidebar displays a "Request Pool" indicator (e.g. "Idle" or "X Processing").

## 4. Non-Goals
*   Building a separate administrative queue management tool (e.g., reordering or cancelling queued Redis jobs).
*   Implementing push notifications or WebSockets for status updates (polling is sufficient for the MVP).
