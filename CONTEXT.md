# Barklog

A gaming backlog tracker: an iOS app and the API behind it, sharing one wire contract.

## Language

### Game catalogue

**Game**:
A game identified by its IGDB id, independently of whether any user has added it to a backlog.
_Avoid_: backlog entry (unless referring to one user's saved game)

**Mirror**:
Barklog's local game catalogue in Postgres, populated from IGDB and used to answer game requests without calling IGDB.
_Avoid_: cache (the mirror is the catalogue the app serves)

**Sync run**:
One attempt to update the mirror from IGDB, including page writes and the screenshot sweep. Only a successful run advances the watermark.
_Avoid_: import (when referring to the recurring sync)

**Watermark**:
The IGDB update time saved by a successful sync run to guide the next incremental run. Reads overlap that time so second-resolution timestamps do not cause missed games.
_Avoid_: cursor (page traversal uses a separate game-id cursor)

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
Any change of the signed-in user on the device, including sign-out. Personal data must not carry across accounts; asynchronous clearing has a known gap recorded in [ADR-0004](docs/adr/0004-account-switch-isolation.md).
_Avoid_: logout (it is only one case)

**Persisted backlog**:
The successful backlog query saved on the device under a per-account key so Home can render before a fresh response arrives. It is restored as stale data, not an independent authority.
_Avoid_: offline backlog (there is no offline write model)

**Widget snapshot**:
A derived view of the backlog, with localized strings and local cover references, published for the home-screen widget to render.
_Avoid_: widget database, second backlog

### Share identification

**Shared link**:
An HTTPS page address submitted to identify games, including links to articles and videos.
_Avoid_: video (unless the source is specifically a video)

**Source metadata**:
The title, author, resolved page address and optional thumbnail details obtained for a shared link.
_Avoid_: game metadata (the source describes a page, not a matched game)

**Guess**:
A game title used to search the mirror during share identification; a guess need not match a game in the mirror.
_Avoid_: candidate (a candidate is already a matched game)

**Candidate**:
A game from the mirror returned as a possible match for a shared link, ordered and deduplicated across guesses.
_Avoid_: identified game (a candidate is not a user-confirmed match)

**Basis**:
The evidence behind share identification: title, author or web; `none` means no titles were identified, and `unavailable` means extraction failed and the raw source title was used instead.
_Avoid_: confidence (basis is not a probability)

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

**Subscription**:
The server-held purchase facts received from RevenueCat, from which entitlement is derived. Turning off renewal does not end an unexpired entitlement.
_Avoid_: entitlement (the purchase facts and the access they grant differ)

### Account deletion

**Account deletion**:
Removal of the Barklog user, backlog and subscription following Clerk's verified deletion notification, with retained subscription events scrubbed. It does not cancel an App Store subscription.
_Avoid_: account switch, sign-out

**Tombstone**:
A retained marker for a deleted Clerk user id that prevents later RevenueCat events from recreating that account.
_Avoid_: deleted account (the marker is not the former account's data)

**Subscription event**:
A recorded RevenueCat delivery used for duplicate detection and retained accounting history. Events belonging to deleted accounts retain only the allowed purchase fields, without the user id or identifying payload fields.
_Avoid_: subscription (an event is a delivery, not the current purchase facts)

## Decisions

See the [ADR index](docs/adr/README.md) for established decisions, their evidence and unresolved guarantees.
