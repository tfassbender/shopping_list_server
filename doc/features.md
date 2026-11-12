# Features

Collection of feature ideas. Prioritization and the implementation plan come later.

Legend: **Must** = MVP, **Should** = soon after MVP, **Could** = nice to have, **?** = not decided yet

## 1. Requirements so far (own ideas)

| Feature                                                        | Priority |
|----------------------------------------------------------------|----------|
| Create, rename, delete shopping lists                          | Must     |
| Add, edit, delete items on a list                              | Must     |
| Check off / un-check items                                     | Must     |
| User management: register, login, logout                       | Must     |
| Email verification, forgot/reset password, change password     | Should   |
| Share a list with other users                                  | Must     |
| Changes on shared lists visible to all members                 | Must     |
| All functionality available via REST (web + Android client)    | Must     |
| Web frontend optimized for mobile                              | Must     |
| Android app                                                    | Later    |

## 2. Reference app: "Einfacher Einkaufszettel" (Jan Kassner)

- Google Play: [de.jkg.einkaufsliste](https://play.google.com/store/apps/details?id=de.jkg.einkaufsliste&hl=de)
- App Store: [id1561406946](https://apps.apple.com/de/app/einfacher-einkaufszettel/id1561406946)
- Website: <https://www.einfacher-einkaufszettel.de/>
- Platforms: Android, iOS, Macs with Apple Silicon
- About 500k+ downloads and ~4.5–4.7 stars (from search snippets)
- Selling point: "bewusst einfach und intuitiv" (deliberately simple), no unnecessary permissions

### Free features (from the website)

- Clear shopping list ("Übersichtliche Einkaufsliste")
- Categories ("Kategorien für bessere Organisation")
- Check off items with one tap ("Einkäufe abhaken")
- Sync with **one** other person ("Synchronisierung mit einer weiteren Person")
- Data stored locally on the device if sync is off (no cloud by default)

### Pro features (0.99 €/month or 7.99 €/year)

- Sync with multiple / unlimited people
- Voice input for quickly adding items ("Spracheingabe")
- Colors for categories ("Farben für Kategorien")
- Extended sorting ("erweiterte Sortierfunktion")

### Mentioned elsewhere (search result summary, not verified)

- Colored sections and a home screen widget

## 3. Features for our app

Reviewed and prioritized. Details in the sections below the table.

| Feature                                                          | Source          | Priority      |
|------------------------------------------------------------------|-----------------|---------------|
| Spaces as the unit of sharing (lists, layouts, history, ...)     | Idea            | Must ([3.1](#31-spaces-sharing-and-permissions)) |
| Multiple lists per space                                         | Common          | Must          |
| Quantity / unit / note per item                                  | Common          | Must          |
| Categories for items (e.g. dairy, vegetables)                    | Reference app   | Must          |
| Colors for categories                                            | Reference (Pro) | Must          |
| Sort items by shop layout, "most used first"                     | Reference (Pro) | Must ([3.2](#32-shops-and-sorting)) |
| Option: checked items move to the end of the list                | Idea            | Must ([3.2](#32-shops-and-sorting)) |
| Autocomplete from item history                                   | Common          | Must          |
| "Remove all checked items"                                       | Common          | Must          |
| Undo for check (not for delete)                                  | Common          | Must          |
| Sharing with unlimited users (free, it's our own app)            | Reference (Pro) | Must          |
| Share via single-use invite link only (no user search)           | Idea            | Must ([3.1](#31-spaces-sharing-and-permissions)) |
| Roles (owner / member), leave space, remove member               | Idea            | Must ([3.1](#31-spaces-sharing-and-permissions)) |
| Offline usage with sync when back online                         | Idea            | Must ([3.5](#35-offline-usage-and-sync)) |
| Public REST API (OpenAPI) + personal API tokens for AI agents    | Idea            | Must ([3.6](#36-api-access-for-ai-agents)) |
| Dark mode                                                        | Idea            | Must          |
| Live updates on shared lists                                     | Reference       | Should ([3.4](#34-live-updates)) |
| German + English UI                                              | Idea            | Should        |
| Voice input                                                      | Reference (Pro) | Could ([3.3](#33-voice-input)) |
| Installable PWA                                                  | Idea            | Could         |
| Android home screen widget (Android app)                         | Reference       | Later         |

### 3.1 Spaces, sharing and permissions

**Accounts:** email, display name, password (with email verification and password reset). Other
members only see the display name.

**Space**: the only thing that can be shared.
- Contains everything: lists, shop layouts, categories, units, item history, ...
- **Exception:** API tokens and the account settings are personal (per user), never shared.
- A user can own and be member of several spaces.
- **Order of spaces:** each user sorts their spaces by drag and drop on the spaces page (personal, stored
  on the server, `PUT /api/spaces/order`). The space list and the start page use it; spaces not sorted
  yet (e.g. joined later) come after the sorted ones, by name.

**Roles:** exactly two per space – **owner** (exactly one) and **member**.

| Action                                                               | Owner | Member |
|----------------------------------------------------------------------|-------|--------|
| View lists, add / edit / check / delete items, remove checked items  | ✓     | ✓      |
| Create / edit layouts, categories, units in the space                | ✓     | ✓      |
| Create / rename lists                                                | ✓     | ✓      |
| Delete lists                                                         | ✓     | ✗      |
| Rename the space                                                     | ✓     | ✗      |
| Create / revoke invite links                                         | ✓     | ✗      |
| Remove a member                                                      | ✓     | ✗      |
| Delete the space                                                     | ✓     | ✗      |
| Leave the space                                                      | after handing over ownership | ✓ |
| Hand over ownership to another member                                | ✓     | ✗      |

**Invite links:**
- Created and revoked by the owner only.
- **Single-use:** one link adds exactly one user (other than the owner).
- **Expiry configurable** when creating the link, default **1 day**.
- Revocable until used. Opening the link requires login (or registration first).
- Only a hash of the token is stored.

**Account deletion:**
- Owned spaces: ownership passes automatically to the member with the **longest membership**. Without
  other members, the space is deleted.
- Memberships in other spaces are removed.

### 3.2 Shops and sorting

- **Shop layouts** define the sort order of a list for a specific shop (e.g. grocery list sorted by the
  supermarket layout, not by the hardware store layout).
- Layouts are created by a user, belong to the space and can be **connected to several lists**.
- Per shop: sort by **"most used first"**. (Personal favorites per shop existed until 2026-11-12 and
  were removed: their effect - first within a category - was too small to be worth the switch.)
- **Config option: checked items move to the end** of the list (no scrolling past checked items).

Decided:
- A layout can sort by **categories** (default, e.g. vegetables → dairy → frozen – new items are placed
  automatically) **or by individual items**.
- A list can have **several layouts** (e.g. Aldi and Rewe for the grocery list); the user picks one.
- "Checked items to the end" is a **personal setting** (per user).
- **Without a shop** a list shows its items exactly in the **order of adding** (no category groups - they
  would look like a shop's sorting).


### 3.3 Voice input

- The app must stay **free** – only add voice input if a free speech recognizer is available.
- Candidates: browser Web Speech API (free in Chrome, not available in every browser), Android's built-in
  `SpeechRecognizer` (free).

### 3.4 Live updates

- **SSE** (server-sent events): the server notifies clients that a space changed, clients then fetch the
  changes via the sync endpoint (notify-then-refetch).
- Android app may use a different mechanism (e.g. push via FCM in the background) – decided later.

### 3.5 Offline usage and sync

- Lists must be usable without connection; changes sync when back online.
- **Works offline:** everything with lists and items (add, edit, check, delete, remove checked, create /
  rename lists). **Needs a connection:** space management (invite links, members, ownership) and API tokens.
- Client-side storage: web IndexedDB, Android Room.
- Autocomplete works offline too: clients receive the space's item history (catalog + sync pull) and rank
  suggestions like the server.

**Merge strategy: automatic merge, change by change** (option "C" from the discussion)
- The client records small, fine-grained changes ("check item X", "set quantity of Y to 3", "add item Z")
  and sends them in order when back online.
- Changes to different fields / items merge automatically.
- Same field of the same item changed by two users → **the later change wins**.
- **Delete vs. edit → the edit wins:** an item deleted by one user but edited offline by another is
  restored. (A superfluous item is easier to notice than a missing one.) Same for "remove all checked items".
- **Merge warnings:** if a merge overwrote or restored something, a small **warning icon** appears; tapping
  it opens a dialog listing what happened (e.g. "Anna changed the quantity of milk to 3"). No popup on
  its own.
- **User setting:** ignore merge warnings (icon is not shown).

Technical basics:
- Ids of new items / lists are created on the client (UUIDs), so creating works offline.
- Every change carries its own change id → resending after a lost connection is idempotent.
- The server numbers changes per space; clients fetch only changes since their last sync.

### 3.6 API access for AI agents

- AI agents (and other tools) use the same REST API; it is documented with **OpenAPI**.
- Users can create **personal API tokens** (name, expiry), list and revoke them. Only a hash is stored.
- A token acts as the user who created it (limited to read access for read-only tokens).
- Two token types: **read-only** and **full access** (full = same permissions as the user).
- **No MCP server** – agents use the REST API only.
