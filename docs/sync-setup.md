# Sync the Bank Game across devices

Sync is optional. Until the address in `bank/sync.js` is filled in, the app stays on this device and does not contact a server.

Use a Supabase project on the **free** plan. Do not upgrade the project, add paid products, or raise quotas. One account on a phone and a laptop fits the free plan. The built-in sign-in email has a daily cap, so send a link only when you need one.

## Set up

1. Create a project on the Supabase free plan. Skip paid add-ons if the form offers them.
2. Open the SQL editor and run `docs/sync-setup.sql`. That creates `ledger_entries` and turns on row-level security. Each signed-in account can read and write only its own rows. Anonymous visitors cannot. Rows are not deleted: an untap is stored on the row.
3. Open Authentication and leave the Email provider on. Leave anonymous sign-ins off. Under URL configuration, set Site URL to the address of the bank page, and add that same address to Redirect URLs.
4. Open Project Settings → API. Copy the project URL and the **anon** public key. Do not copy the `service_role` key, and do not put that key in the app or in this repo. The anon key is fine to ship. Row-level security is what keeps rows private.
5. In `bank/sync.js`, fill in the single `SLB_SUPABASE` constant:

   ```js
   var SLB_SUPABASE = { url: "https://YOUR-PROJECT.supabase.co", anonKey: "YOUR-ANON-KEY" };
   ```

   Leave both strings empty to keep sync off.

6. On the phone, open the Bank tab, tap **Sync across devices**, enter an email, and open the link on that same phone. Repeat on the laptop with the same email, and open that link on the laptop. Each device signs in once. After that, taps upload when you are online.

## How a sync combines the two devices

The browser keeps `slb.v1` in local storage. That copy is the offline record. Sync sends the ledger entries, not a running total.

Each tap has an id. A sync keeps every id from both devices and keeps a shared id only once, so the same tap is not counted twice. Untapping does not remove the row. It marks the entry undone, and that mark wins if the other device still has the tap. Coins are counted again from the combined list.

Custom task names, practice notes, and week plans stay on the device. The taps themselves, and the coins counted from them, are what line up.
