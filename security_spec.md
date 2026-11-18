# Security Specification: Material AI Chatbot (`users/{uid}`)

## 1. Data Invariants
1. Every document under `/users/{uid}` is strictly private to the authenticated user whose `request.auth.uid == uid`.
2. Users cannot list `/users` to enumerate other accounts or PII (`email`, `displayName`).
3. A `ChatThread` at `/users/{uid}/chats/{chatId}` cannot be created unless `/users/{uid}` exists, `ownerId == request.auth.uid`, and `id == chatId`.
4. A `ChatMessage` at `/users/{uid}/chats/{chatId}/messages/{messageId}` cannot be created unless its parent `ChatThread` exists, `ownerId == request.auth.uid`, `chatId` matches the path, and `role` is strictly `'user'` or `'assistant'`.
5. Server timestamps (`request.time`) are enforced on `createdAt` and `updatedAt`; `uid`, `ownerId`, `id`, and `createdAt` are immutable after creation.
6. All string lengths, array sizes (`facts <= 25`), and temperature bounds (`0 <= temperature <= 2`) are enforced in Firestore rules to block Denial-of-Wallet payloads.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read on `/users/alice`: `auth: null`.
2. Cross-user read on `/users/alice` while signed in as `bob`.
3. User directory `list` query on `/users` while signed in as `bob`.
4. Identity spoofing on create `/users/bob` with `{ uid: "alice", ... }`.
5. Shadow field injection ("Ghost Field") on `/users/bob` update with `{ isAdmin: true }`.
6. Client-forged `createdAt` timestamp on `/users/bob` create (`new Date(2020, 0, 1)` instead of `serverTimestamp()`).
7. Oversized `systemInstruction` (> 2000 chars) on `/users/bob` update.
8. Out-of-bounds `temperature` (`temperature: 9.5`) on `/users/bob` update.
9. Oversized `facts` array (30 items > 25 max) or non-string first element (`[123]`) in `sharedMemory.facts`.
10. Poisoned document ID (`/users/bob/chats/bad$id` with invalid characters or > 128 chars).
11. Orphaned `ChatMessage` create under a non-existent `chatId` parent.
12. Mutating an immutable `ChatMessage` (`update` on `/users/bob/chats/c1/messages/m1`) or setting `role: "system"`.
