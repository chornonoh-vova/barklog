# Barklog

A gaming backlog tracker: an iOS app and the API behind it, sharing one wire contract.

## Language

### Backlog

**Backlog entry**:
One game in one user's backlog, with a status and an optional rating.
_Avoid_: item, row (except for UI rows)

**Status**:
Where a backlog entry stands: waiting, playing, completed or abandoned.
_Avoid_: state

**Move**:
A change of a backlog entry's status. A move keeps the rating.
_Avoid_: status update, transition

**Backlog entry write**:
Any add, move, re-rating or removal of a backlog entry. The server applies it under the free-tier cap; the device shows it once the server has, by refetching.
_Avoid_: upsert (outside the db query), mutation

### Device

**Recents**:
The user's recent search queries, kept only on the device and cleared on an account switch.
_Avoid_: history, search history

**Account switch**:
Any change of the signed-in user on the device, including sign-out. Everything personal on the device is cleared.
_Avoid_: logout (it is only one case)

### Premium

**Slot**:
The room one unfinished backlog entry (waiting or playing) takes on a free account.
_Avoid_: active count, capacity

**Free-tier cap**:
The limit of `FREE_ACTIVE_SLOTS` slots on a free account, enforced by the server with a 402.
_Avoid_: backlog limit, quota

**Slot check**:
The device's advisory pre-check against the free-tier cap, made at tap time from cached data. When it can't tell, it lets the write through; the free-tier cap is the authority.
_Avoid_: gate, paywall check

**Entitlement**:
What the server says a user's subscription grants. **Premium** means an active entitlement.
_Avoid_: subscription status, pro
