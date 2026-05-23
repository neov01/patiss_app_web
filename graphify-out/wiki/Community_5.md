# Community 5

> 15 nodes

## Key Concepts

- **openDB()** (12 connections) — `src/lib/offline/db.ts`
- **db.ts** (12 connections) — `src/lib/offline/db.ts`
- **syncPendingData()** (4 connections) — `src/lib/offline/sync.ts`
- **getPendingOrders()** (3 connections) — `src/lib/offline/db.ts`
- **getPendingTransactions()** (3 connections) — `src/lib/offline/db.ts`
- **cacheProducts()** (2 connections) — `src/lib/offline/db.ts`
- **cacheReadyOrders()** (2 connections) — `src/lib/offline/db.ts`
- **getCachedProducts()** (2 connections) — `src/lib/offline/db.ts`
- **getCachedReadyOrders()** (2 connections) — `src/lib/offline/db.ts`
- **getPendingCounts()** (2 connections) — `src/lib/offline/db.ts`
- **queueOrder()** (2 connections) — `src/lib/offline/db.ts`
- **queueTransaction()** (2 connections) — `src/lib/offline/db.ts`
- **removePendingOrder()** (2 connections) — `src/lib/offline/db.ts`
- **removePendingTransaction()** (2 connections) — `src/lib/offline/db.ts`
- **sync.ts** (1 connections) — `src/lib/offline/sync.ts`

## Relationships

- No strong cross-community connections detected

## Source Files

- `src/lib/offline/db.ts`
- `src/lib/offline/sync.ts`

## Audit Trail

- EXTRACTED: 48 (91%)
- INFERRED: 5 (9%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*