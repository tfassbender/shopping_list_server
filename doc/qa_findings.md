# QA findings – exploratory test run 2026-11-11

Open findings, to be worked through later. Screenshot paths point to a local temp folder of the test run and may no longer exist.

## How it was tested
- **What ran:** two subagents clicked through the app with Playwright (headless Chromium, mostly at phone size 390×844, some screens at 1280×800, dark mode included).
- **Where:** a separate instance of the current `main` (packaged JAR on http://localhost:4730, empty data folder, email verification off).
- **Tester "accounts":** registration and login, account settings, spaces and sharing, invites, settings, API tokens, start page, German texts, theme.
- **Tester "lists":** lists, the add dialog, items, sorting, shops, categories and units, "Items used before", offline, live updates and merge warnings with two users.
- **Also included:**
  - one bug found by the new frontend tests (marked "frontend tests");
  - two unconfirmed notes from the test-writing subagents.

**Screenshots** (prefix used below):
- **SA\\** = `C:\Users\Tobia\AppData\Local\Temp\claude\cf076382687658bf\acf79e11-ee75-4cc0-860e-e8ee1e62de9b\scratchpad\qa\tester-accounts\shots\`
- **SL\\** = `C:\Users\Tobia\AppData\Local\Temp\claude\cf076382687658bf\acf79e11-ee75-4cc0-860e-e8ee1e62de9b\scratchpad\qa\tester-lists\shots\`

The testers' scripts are in the same `qa\tester-*` folders. Code paths are relative to the repository.

**Severity:** 🔴 broken · 🟠 wrong behavior · 🟡 UX problem · ⚪ cosmetic

## Status 2026-11-12

Worked through in the session of 2026-11-12 (commits `e0a36aa`..`e99dab9`), each fix with tests.

**Notes on the fixes**
- **#2:** new port method `SpaceChangeNotifier.accessLost(...)`; delete/remove/leave notify the users
  who lost access, so their clients refetch and get the 404.
- **#8:** a *forced* logout (401) keeps the data on purpose, so the same user's unsaved offline changes
  survive logging in again. When a *different* user logs in, cached and offline data are wiped first
  (remembered user id in localStorage). A deliberate logout wipes everything as before.
- **#9:** the server gives items of one batch distinct `createdAt` (+1 ms each); the client compares
  instants correctly (ISO strings with differing fraction lengths don't sort as strings).
- **#19:** a member re-opening a link they already used still gets "invalid" - the server forgets used
  invites, so it can't tell. Owners/members opening a *valid* link now get a message.
- **#21:** the header back arrow goes back in the history when the previous page is its target,
  otherwise it replaces the current entry (`components/backNavigation.ts`).

**Decided (2026-11-12)**
- **#18** keep the category header toggle as it is.
- **#22** no undo/confirmation for "Remove checked" and deleting an item - fine as it is.
- **#22** amount field: input is kept as typed ("1.2.3"), marked invalid and blocks saving - done.
- **#23** a unit without an amount is not shown ("l Oat milk" → "Oat milk") - done.
- **#19** a member re-opening an already used link getting "invalid" is OK.

**Still open**
- **#22** favorite switch vs. Cancel; duplicate items without hint; emoji counting as two characters
  in name limits.
- **#23** history merge changing the spelling; the remaining console noise is reduced (4xx are no
  longer retried, deleted spaces aren't refetched).
- **#24** ("offline status after logout" is fixed: `clear()` resets the status.) Start page offline without cached data now shows "Loading..." per space until the first
  pull (before it showed "no lists", which was wrong too); corrupt data files; data model points.

---

## Overview

| # | Finding | Severity | Area | Status |
|---|---|---|---|---|
| 1 | Removed member: list stuck on "Loading...", new items lost | 🔴 | Spaces / sync | ✅ fixed |
| 2 | Deleted space / removal not shown live to the people affected | 🟠 | Live updates | ✅ fixed |
| 3 | Favorite set offline is silently lost | 🟠 | Shops / offline | ✅ fixed (switch disabled offline) |
| 4 | Whitespace-only item name → misleading "merged changes" note | 🟠 | Items | ✅ fixed |
| 5 | Duplicate category names allowed | 🟠 | Categories | ✅ fixed |
| 6 | Logout / delete account land on `/login?redirect=/settings` | 🟠 | Accounts | ✅ fixed |
| 7 | Theme/language change lost on quick reload; other devices' changes ignored | 🟠 | Settings | ✅ fixed |
| 8 | Forced logout leaves the previous user's data on the device | 🟠 | Accounts / privacy | ✅ fixed (see note) |
| 9 | "Order of adding" not stable for items synced together | 🟠 | Lists / sync | ✅ fixed |
| 10 | Sort button: re-checked item jumps straight to "Checked" | 🟠 | Lists | ✅ fixed |
| 11 | Shop item order: entry with double spaces fails silently | 🟠 | Shops | ✅ fixed |
| 12 | Browser back after deleting a space shows contradicting page | 🟠 | Spaces | ✅ fixed |
| 13 | "New list" link under an empty space preselects the wrong space | 🟠 | Start page | ✅ fixed |
| 14 | List header breaks with the offline badge / ⚠ icon | 🟡 | Layout | ✅ fixed |
| 15 | Settings rows: email overlaps its label, long names break the row | 🟡 | Layout | ✅ fixed |
| 16 | Long words without spaces overflow (items, list names) | 🟡 | Layout | ✅ fixed |
| 17 | Suggestion dropdown: arrow keys don't scroll; Escape closes the whole dialog | 🟡 | Add dialog | ✅ fixed |
| 18 | Category header toggle seems to do nothing without a shop | 🟡 | Lists | ✅ kept as is (decided) |
| 19 | Invalid invite link is a dead end; "already member" not recognised | 🟡 | Invites | ✅ fixed (rest OK as is) |
| 20 | Missing translations for several backend error codes | 🟡 | i18n | ✅ fixed |
| 21 | Back navigation: Shops page doesn't return to the list; in-app back adds history entries | 🟡 | Navigation | ✅ fixed |
| 22 | Several smaller UX points | 🟡 | various | ◐ partly |
| 23 | Cosmetic points | ⚪ | various | ◐ partly |
| 24 | Unconfirmed / to decide | ❔ | various | ◐ partly |

---

## 🔴 Broken

### 1. A removed member's list gets stuck on "Loading...", and new items are lost without a message
- **Found by:** tester "accounts"
- **Steps:**
  1. Ben, a member of Anna's space, has one of its lists open. Anna removes Ben.
  2. Ben's page keeps showing the list with no sign of the removal.
  3. Ben can still add an item: `POST /api/spaces/{id}/changes` → 404. The page switches to "Loading..." with no explanation, and the item is gone.
  4. Reloading the list URL shows "Loading..." with no end.
- **Same symptom:** any deep link to a list in a space you are not (or no longer) a member of. A wrong list id in your own space correctly shows "This list does not exist (anymore)".
- **Expected:** a clear message ("You are no longer a member of this space") and a way back.
- **Code:** `frontend/src/offline/engine.ts:33` (`useLocalList` returns `undefined` for a space the engine doesn't know or has dropped) + `frontend/src/lists/ListPage.tsx:62` (`undefined` = "Loading").
- **Screenshots:** SA\97-ben-removed-add-dialog.png, SA\91-ben-list-reload-after-removal.png, SA\de-list-unknown.png

---

## 🟠 Wrong behavior

### 2. Deleting a space or removing someone is not shown live to the people affected
- **Found by:** tester "accounts"
- **Steps:** Anna deletes the space "Flat" while her second device and the member Cleo both have its page open.
- **Actual:** after 3 s both still show the full space, including members and "Invite someone". A removed member gets no live update either (see 1).
- **What works:** live updates for members who stay (new member, a member removed as seen by the owner, rename, new list).
- **Likely cause:** the event stream only forwards events for spaces the user is a member of. After the deletion or removal they no longer are, so the event never arrives.
- **Code:** `backend/.../adapter/rest/EventResource.kt:65-73` (`isMember` filter).
- **Screenshots:** SA\99-a2-deleted-space.png, SA\99b-cleo-deleted-space.png

### 3. Marking a favorite while offline is silently lost
- **Found by:** tester "lists"
- **Steps:** list sorted for a shop → go offline → pencil on an item → turn on "Favorite at <shop>" → close → go online.
- **Actual:** the switch turns on and the list treats the item as a favorite (optimistic cache), but the server never gets it, and no error is visible.
- **Expected:** the switch is disabled offline, or the change is queued, or an error is shown.
- **Code:** `frontend/src/lists/ListPage.tsx` `useToggleFavorite` (online-only mutation, optimistic `onMutate`, the error is only shown behind the dialog); the `ItemEditor.tsx` switch isn't disabled offline.
- **Screenshot:** SL\t6-03-offline-fav.png

### 4. A whitespace-only item name is accepted, then rejected with a misleading "merged changes" note
- **Found by:** tester "lists"
- **Steps:** pencil on an item → replace the name with "   " → Save.
- **Actual:**
  - The dialog closes and the name stays.
  - A ⚠ appears in the header. The dialog it opens is titled "Merged changes" and says "While you were offline, others changed the same lists…" and "A change could not be saved: Please enter a name". The user was online and alone.
- **Expected:** Save disabled, or a validation message in the dialog.
- **Code:** `frontend/src/lists/ItemEditor.tsx` (`required` accepts spaces; `trim() || null` then sends `name: null`); the texts for rejected changes are in `offline/SyncIndicator.tsx`.
- **Screenshots:** SL\t9-01-rejected-warning.png, SL\t2-10-headers-toggled.png

### 5. Duplicate category names are allowed
- **Found by:** tester "lists"
- **Steps:** Categories & units → rename "Pantry" to "Bakery"; or create "Snacks" and then "snacks".
- **Actual:** both are saved; the add and edit dialogs then show two entries with the same name.
- **Expected:** an error (the text `error.CATEGORY_EXISTS` already exists).
- **Code:** `backend/.../domain/space/SpaceCatalog.kt`. `addCategory` only checks for the same id, which never matches because ids are UUIDs; `updateCategory` doesn't check names at all.
- **Screenshots:** SL\t4-02-rename-existing.png, SL\t4-06-units.png

### 6. Logout, account deletion and forced logout all land on `/login?redirect=/settings`
- **Found by:** tester "accounts", and confirmed by the frontend tests (skipped test in `frontend/src/pages/SettingsPage.test.tsx`).
- **Actual:**
  - After a plain logout you land on `/login?redirect=%2Fsettings`. Logging in again (even as a different user) then opens Settings instead of the start page.
  - "Delete my account" should go to `/register`, but also lands on the login page.
- **Cause:** `logout()` clears the session first, so the login guard (`RequireAuth`) redirects before the explicit `navigate(...)` takes effect.
- **Code:** `frontend/src/pages/SettingsPage.tsx`, `auth/RequireAuth.tsx`.
- **Screenshot:** SA\70-after-delete.png

### 7. Theme/language changes can be lost on reload; changes from another device are ignored
- **Found by:** tester "accounts"
- **Steps:**
  1. Settings → "Dark", then reload within about 1 s. The server has saved DARK, but the app comes back light and Settings shows "Like the system".
  2. Change the theme through the API, as another device would, and reload: the old value stays.
- **Likely cause:** `useCurrentUser` has `staleTime: 60_000`, and the query cache stored in IndexedDB is written with the persister's default 1 s throttle. On reload the old user data is restored and not fetched again.
- **Code:** `frontend/src/auth/useAuth.ts`, `frontend/src/App.tsx` (persister).
- **Script:** `qa\tester-accounts\t12_persist.mjs`

### 8. A forced logout leaves the previous user's data on the device
- **Found by:** tester "accounts". Privacy issue, low severity.
- **Steps:** another device changes the password or uses "Log out on all other devices" → this device gets a 401.
- **Actual:**
  - A normal logout clears the query cache and IndexedDB. A 401 only clears the session.
  - IndexedDB still holds the profile (email), list names and an unsynced offline change.
  - When a different user logged in on that device, the app requested the previous user's space with the new user's token (→ 404). Pending offline changes of the previous user would be dropped without notice.
  - No foreign lists were visible on screen.
- **Code:** `frontend/src/api/client.ts:47` (`clearSession()` only).

### 9. "Order of adding" is not stable for items synced together; a restored item moves on one device
- **Found by:** tester "lists"
- **Observation:** items added quickly one after another get the same server `createdAt`. `sortItems` sorts only by `createdAt`, so ties keep whatever order the local array has.
- **Steps:** A and B share a list, both go offline; A deletes "Eggs", B edits "Eggs"; A goes online, then B.
- **Actual:** the restored "Eggs" is at the end of A's list, but in its original place on B and on A after a reload.
- **Code:** `frontend/src/lists/sortItems.ts` (no tiebreaker); `frontend/src/offline/applyOp.ts` lines 83–88 (a restored item is re-inserted at the end); the server sets `createdAt` per sync batch.
- **Screenshots:** SL\t7-03-A-after.png vs SL\t7-04-B-after.png

### 10. Sort button: an item you uncheck and check again jumps straight to "Checked"
- **Found by:** tester "lists"
- **Steps:** check A and B → sort button → uncheck B (it correctly returns to its place) → check B again.
- **Actual:** B jumps to "Checked" at once, while other newly checked items stay in place.
- **Code:** `frontend/src/lists/ListPage.tsx` never removes ids from `movedToEnd`. The comment in `sortItems.ts` (`splitMoved`) says the caller does this, but no caller does.

### 11. Shop "By single items": an entry that differs only by spaces fails silently
- **Found by:** tester "lists"
- **Steps:** the shop's item order has "Random thing" → add "Random  thing" (two spaces).
- **Actual:**
  - `PUT /item-order` → 400 `INVALID_ORDER`.
  - The entry disappears; the error is shown at the top of the page, out of view.
  - Related: adding an exact duplicate ("water" when "Water" exists) silently clears the field without a hint.
- **Code:** `frontend/src/pages/space/LayoutPages.tsx` `ItemOrderEditor`. Its duplicate check only lowercases; the server (`normalizeName`) also collapses spaces.
- **Screenshot:** SL\t3-11-items-mode-after.png

### 12. Browser back after deleting a space shows a contradicting page
- **Found by:** tester "accounts"
- **Steps:** delete a space (the app goes to /spaces) → browser back.
- **Actual:**
  - The error "This space does not exist or you are not a member." appears above the old members, "Invite someone" and the ⋮ menu.
  - In the background the page keeps retrying (about 25 requests that get 404).
- **Code:** `frontend/src/pages/space/SpacePage.tsx`; the error view only shows when `!space && error`, so with cached data the page renders anyway.
- **Screenshot:** SA\96-back-after-delete.png

### 13. Start page: "New list" under a space without lists preselects the wrong space
- **Found by:** tester "accounts"
- **Steps:** two spaces without lists → tap "New list" in the second space's section.
- **Actual:** the dialog preselects the first space ("Home").
- **Expected:** the space whose section was tapped.
- **Code:** `frontend/src/pages/HomePage.tsx`; `SpaceLists` calls `onNewList()` without its space id.
- **Note:** the ⋮ → New list entry behaves as designed (last used space, otherwise the first one).
- **Screenshot:** SA\21-newlist-from-space2-link.png

---

## 🟡 UX problems

### 14. The list header breaks when the offline badge or the ⚠ merge icon is shown
- **Found by:** tester "lists". Close to broken on a phone.
- **With "Offline · N unsaved":**
  - the list title shrinks to a single letter;
  - "Sorted for Aldi Süd" wraps over 3–4 lines, with the badge drawn over it.
- **With only the ⚠ icon:** "Order of adding" still wraps onto two lines.
- **Code:** `frontend/src/components/AppBar.tsx` puts the sync indicator in the same row as the title, the two action buttons and ⋮. The badge is `whitespace-nowrap` (`offline/SyncIndicator.tsx`), so the title column gets squeezed.
- **Screenshots:** SL\t6-04-offline-changes.png, SL\t7-02-B-offline.png, SL\t6-03-offline-fav.png, SL\t2-10-headers-toggled.png, SL\t7-04-B-after.png

### 15. Settings: the email overlaps its label, and a long display name breaks the row
- **Found by:** tester "accounts"
- **Email:** with an ordinary address like `max.mustermann.xxxx@gmail.com`, the address is drawn over the label "Email" at 390 px. In German, "E-Mail" breaks into "E-" / "Mail".
- **Display name:** with a name of about 40 characters, the label and its hint shrink to one word per line and overlap the name.
- **Code:** `frontend/src/components/ui.tsx` `Row`. The title has `min-w-0 flex-1` and is what shrinks; the `end` element doesn't give way.
- **Screenshots:** SA\100-settings-normal-email.png, SA\60-settings.png, SA\61-settings-longname.png, SA\de-settings.png

### 16. Long words without spaces overflow
- **Found by:** both testers
- **Items:** an item name of about 80 characters without spaces runs under the pencil button and off-screen; the whole page scrolls sideways (`scrollWidth` 842 at 390 px). Code: `ItemRow` in `frontend/src/lists/ListPage.tsx` (no `break-words`). Screenshots: SL\t1-11-long-word.png, SL\t2-02-sorted.png
- **Lists:** a 60-character list name without spaces runs under the count badge on the start page. Screenshot: SA\23-start-two-lists.png

### 17. Suggestion dropdown in the add dialog
- **Found by:** tester "lists"
- **Arrow keys:** they don't scroll the highlighted suggestion into view, so Enter adds an item the user can't see. Code: `frontend/src/lists/AddItemDialog.tsx` `onKeyDown` (no `scrollIntoView`). Screenshot: SL\t10-01-arrow-5.png
- **Escape:** with the dropdown open, Escape closes the whole dialog and the typed text is lost; a first Escape should only close the dropdown. Code: the global Escape handler in `frontend/src/components/Dialog.tsx`.

### 18. The category header toggle seems to do nothing on lists without a shop
- **Found by:** tester "lists"
- **Actual:** without a shop, "Show category headers" ON shows neither headers nor colour bars; only OFF shows the bars. "On" displays less category information than "off", so the label doesn't match what the user sees.
- **Background:** this came from the decision that "Order of adding" has no category groups.
- **Options:** headers ON without a shop could also show the colour bars, or group by category.
- **Code:** `frontend/src/lists/ListPage.tsx`
- **Screenshots:** SL\t2-09-categories-assigned-noshop.png vs SL\t2-10-headers-toggled.png

### 19. Invite page: an invalid or used link is a dead end
- **Found by:** tester "accounts"
- **Actual:**
  - The error is shown with no back arrow and no "To start" button; the only way out is tapping the header title, which doesn't look like a link.
  - A member re-opening the link they already used gets "invalid" rather than "you are already a member".
  - An owner opening their own valid link is silently redirected to the start page.
- **Code:** `frontend/src/pages/space/InvitePage.tsx`
- **Screenshot:** SA\37-carol-used-link.png

### 20. Missing translations for several backend error codes
- **Found by:** tester "accounts"
- **Affected codes:** `INVITE_NOT_FOUND`, `MEMBER_NOT_FOUND`, `USER_NOT_FOUND`, `SESSION_EXPIRED`, `INVALID_LANGUAGE`, `LIST_EXISTS`, `LAYOUT_EXISTS`, `ITEM_EXISTS`, `TOO_MANY_CATEGORIES`, `TOO_MANY_UNITS`, `SPACE_CHANGED`, `INVALID_CHANGE`, `BATCH_TOO_LARGE`, `INTERNAL_ERROR`. For these the user sees "Something went wrong".
- **Really occurs:** double-tapping "Revoke" for an invite sends two DELETEs; the second gets 404 `INVITE_NOT_FOUND`.
- **Related:** "Revoke" for invites has no confirmation and isn't disabled while the request runs (API tokens do ask first).

### 21. Back navigation
- **From a list:** ⋮ → Shops → the back arrow goes to the space page, not the list. "Manage shops" in the shop dialog does the same. Categories and "Items used before" already return to the list. Code: `LayoutsPage` doesn't use `useBackTo`. *(tester "lists")*
- **History entries:** the in-app back arrow is a link, so it adds a history entry. After list → back arrow → start, the browser or Android back button goes forward into the list again. *(tester "accounts")*

### 22. Smaller UX points
- **Remove / delete without undo:** "Remove N checked" and deleting an item in the edit dialog have no confirmation and no undo.
  - `doc/features.md` lists "Undo for check" as a Must; tapping again to uncheck is currently the only undo.
  - Unused texts `list.removeCheckedConfirm`, `list.undo` and `list.checked` are still in `en.ts`.
- **Favorite switch:** the switch in the edit dialog saves immediately; Cancel doesn't undo it.
- **Category rename:** renaming a category to an empty name leaves the field empty (nothing is saved, but the field isn't reset; reload fixes it). A failed rename gives no feedback.
- **Colour dialog:** Apply stays enabled while the hex field shows an incomplete code; Apply then uses the slider colour, not what the field shows (`components/ColorPicker.tsx`).
- **Amount field:** it silently drops invalid characters: "1.2.3" becomes "1.23", a different number (`lists/AmountUnitFields.tsx`).
- **Duplicate items:** adding the same name twice ("butter" while "Butter" is on the list) creates a second item without a hint. Possibly intended.
- **Member options sheet:** the sheet ("Make owner" / "Remove") has no Cancel button; it only closes via the backdrop or Escape. Screenshot: SA\44-member-options.png
- **Name length:** name fields cut off silently at their maximum length; emoji count as two characters.
- **Session-only endpoints and API tokens:** creating/listing tokens, changing the password, logging out everywhere and deleting the account return 403 with an empty body to an API token, instead of the usual `{code}` JSON. `PUT /api/users/me/display-name` works with a full API token. Possibly intended; worth confirming.

---

## ⚪ Cosmetic

### 23. Cosmetic points
- **Emoji avatars:** a space or display name starting with an emoji shows "�" in the avatar (`components/ui.tsx:168`, `charAt(0)` splits the emoji). Screenshots: SA\14-spaces-two.png, SA\62-frank-sees-dave-name.png
- **Plurals:** "0 lists · 1 members" in English and "1 Listen · 1 Mitglieder" in German (`spaces.summary`).
- **Amount without number:** with the amount cleared but the unit kept, an item reads "l Oat milk".
- **Remove 0 checked:** the ⋮ menu shows "Remove 0 checked" (disabled) when nothing is checked.
- **Delete-account dialog:** it repeats its title in the text, and "longest member" should read e.g. "longest-standing member". Screenshot: SA\69-delete-confirm.png
- **Last used:** "· last used" also appears when there is only one list.
- **History merge:** renaming "Bread" onto "banana" when "Banana" exists changes the surviving entry's spelling to lowercase.
- **Console noise:**
  - after handing over ownership, the old owner's page keeps polling `/invites` (403);
  - after leaving or deleting a space, the page refetches it before navigating away (404s);
  - an unknown space id is retried about 4 times (≈ 7 s) before the error shows.

---

## ❔ Unconfirmed / to decide

### 24. Open points
- **Start page offline without cached data:** once, after an offline reload, the start page stayed on "Loading..." (SL\t6-06-offline-home.png). That browser had been online for only about 1 s, so the spaces may never have been cached. It couldn't be reproduced. Should the start page offline without cached data show a message instead? *(tester "lists")*
- **Offline status after logout:** `syncEngine.clear()` doesn't reset the sync status, so an "Offline" status may survive a logout. It's not confirmed that users can see this. *(frontend tests)*
- **Corrupt data file:** one corrupt `space.json` or `user.json` makes the lookups that scan all files fail for every user (spaces of a member, login by email). That fails loudly instead of overwriting data; the alternative is to skip and log the file. *(backend tests)*
- **Data model:** see the observations at the end of `doc/data_model.md`, e.g.:
  - category ids left behind after deleting a category;
  - shops keep the ids of deleted lists;
  - favorites remain after deleting a shop;
  - deleted lists are never removed;
  - a space's name and members are not part of the sync.

---

## What works (checked by the testers)

**Accounts and spaces** *(tester "accounts")*:
- Registration and login validation; changing the password; "log out on all other devices"; changing the display name; deleting the account (the owned shared space goes to the remaining member, tokens stop working).
- Spaces: create, rename, delete; owner vs. member menus.
- Invites: all validities, copy, accept flow incl. login/register redirect; used and revoked links give a clear error.
- Members: make owner, remove, leave; owner can't leave.
- Start page: counts, "last used", empty states.
- German texts complete on all visited screens (checked automatically against `en.ts`/`de.ts`); dark/light/system themes readable; desktop layout fine.
- API tokens: all scope/validity combinations; read-only tokens are blocked from writing; revoke works.
- Deep links and reloads on all pages; `/spaces/:id/members` redirect; 404 page.

**Lists and shops** *(tester "lists")*:
- Add dialog: amount, unit, "Add another"/Done/Cancel, the dropdown stays above the buttons, suggestions keep the amount and take the category, automatic category from the history, suggestions offline.
- Items: check/uncheck, sort button, "Remove checked", edit dialog, notes; category header toggle with a shop.
- Shops: create, rename, category order (keyboard and mouse), connect lists, choose a shop in a list, favorites, item mode incl. import, copy, delete with confirmation (lists fall back to "Order of adding").
- Categories & units: rename, reorder, delete dialog, colour picker (palette, slider, hex), units appear in the add dialog.
- Items used before: search, rename, merge, remove.
- Offline: badge; add/check/edit/rename offline; reload offline via the service worker; sync afterwards verified through the API.
- Live updates between two users within about 0.5 s; the start page count updates live.
- Concurrent offline edits: later change wins; edit beats delete; merge notes dialog; the setting to hide them works.
- No JS errors in any flow.

## Not tested
- Real emails (email disabled on the test instance).
- Waiting out invite/token expiry.
- The native share sheet, touch drag, voice input, PWA install, whether the screen really stays on.
- Real phone behaviour (Android back button, safe areas).
- Real network loss in the middle of a sync, and performance with many items.
