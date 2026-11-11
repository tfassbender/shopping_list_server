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

### Unknown – to check on the phone

- [ ] How does sharing/sync work (account? invite code/link?)
- [ ] Multiple lists or only one list?
- [ ] Autocomplete / suggestions from previously bought items?
- [ ] Item details: quantity, unit, note?
- [ ] What exactly does sorting do (by category, manual drag & drop, store order)?
- [ ] What happens to checked items (stay crossed out, move down, "clear checked")?
- [ ] Widget features
- [ ] Dark mode
- [ ] Undo after delete/check
- [ ] Anything else used regularly

> Analyzing the installed app directly is not possible from this machine without Android tooling
> (adb / Android Studio). Best options: screenshots from the phone, or a short walkthrough of the
> features you actually use.

## 3. Candidate features for our app

Derived from the reference app and common shopping list apps. To be reviewed.

| Feature                                                          | Source        | Priority |
|------------------------------------------------------------------|---------------|----------|
| Categories for items (e.g. dairy, vegetables)                    | Reference app | ?        |
| Colors for categories                                            | Reference (Pro) | ?      |
| Sort items by category / custom order                            | Reference (Pro) | ?      |
| Sharing with unlimited users (free, it's our own app)            | Reference (Pro) | Must   |
| Voice input (browser Web Speech API / Android speech recognizer) | Reference (Pro) | Could  |
| Live updates on shared lists (polling → SSE/WebSocket)           | Reference     | Should   |
| Multiple lists per user                                          | Common        | ?        |
| Quantity / unit / note per item                                  | Common        | ?        |
| Autocomplete from item history                                   | Common        | ?        |
| "Remove all checked items"                                       | Common        | ?        |
| Undo for delete / check                                          | Common        | ?        |
| Share via invite link (instead of searching user)                | Idea          | ?        |
| Roles on shared lists (owner / editor), leave list, remove member | Idea         | ?        |
| Offline usage with sync when back online                         | Idea          | ?        |
| Installable PWA                                                  | Idea          | Should   |
| Dark mode                                                        | Idea          | ?        |
| German + English UI                                              | Idea          | ?        |
| Android home screen widget (Android app)                         | Reference     | Later    |
