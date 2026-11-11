# Manual offline test checklist

Automated tests cover the sync logic (`SyncEngine`, merge rules). These checks cover what only a real
browser shows: service worker, IndexedDB, connection changes. Run against a **production build**
(`./gradlew build -PwithFrontend`, then `java -jar backend/build/quarkus-app/quarkus-run.jar`) – the
service worker is not active in the Vite dev server.

Use Chrome DevTools → Network → "Offline" (or airplane mode on a phone).

1. **Offline start:** open a list online once, reload, go offline, reload again → the app and the list
   appear (from the service worker cache and IndexedDB).
2. **Offline changes:** add an item, check one, edit one, "remove checked" → all visible at once; the
   header shows "Offline · N unsaved".
3. **Offline list:** create a new list in a space offline and add items to it.
4. **Management screens:** members, categories, shops, settings show the "needs a connection" hint and
   their buttons are disabled.
5. **Reconnect:** go online → the badge disappears within a few seconds; a second device / browser shows
   the changes.
6. **Close while offline:** make changes offline, close the tab, reopen online → the changes are sent.
7. **Merge warning:** device A offline changes the quantity of an item, device B (online) deletes it;
   A goes online → the item is back, the ⚠ icon appears, its dialog explains what happened. With the
   setting "Hide merge warnings" the icon does not appear.
8. **Logout:** log out and log in as another user → none of the previous user's lists are visible.
