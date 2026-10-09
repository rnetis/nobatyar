## 2024-05-18 - N+1 Query in Queue Engine Actions
**Learning:** The `executeQueueAction` in `src/lib/queue-engine.ts` suffered from a serious N+1 problem inside its broadcast loop. For every waiting person in the queue, it was doing a DB lookup for `queue` and a call to `activeStaffCount` (which itself performs more DB lookups).
**Action:** Always inspect loops in server-side logic that iterate over queue entries or large result sets to ensure no database calls are inadvertently made per iteration.
