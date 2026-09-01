# Business Team Panel (web) — control your bot teams from ad4you.click

Business-plan owners get a full team control panel on the website, wired to the exact same cloud tables your desktop software already uses (`teams`, `team_members`, `team_configurations`, `earnings_config`, `team_earnings`, `team_leaderboard`, `withdrawal_requests`, `companies`, `team_pcs`, `team_activity_logs`, `session_url_tracking`). Anything the owner changes on the web appears in every member's software in real time, and anything members do in the software appears live on the web.

## Who sees it

- A new "Business Panel" entry appears in the account/profile area and navbar only when the signed-in user has an active **business** plan (site admins always see it).
- Non-business users see an upgrade card instead of the panel.

## Pages

```text
/business
  Overview      live team stats: members online, PCs, visits today, ads viewed/clicked, hours, earnings today/total
  Teams         create / rename / delete teams, company name, contact info, pick the single Team Leader
  Members       add Editor / Runner / Viewer, set password, per-member permission switches (18 tools), online status,
                activate / deactivate, remove, reset password, change role, per-member live stats
  URLs          the shared URL list (website / direct link / social-video), per-URL type, visit count, time per page,
                video strategy; save = every member's software switches to the new URLs instantly
  Rules         locked proxies, traffic mode, devices, daily limit per member, allowed hours, concurrent tabs
  Earnings      per-visit / per-point / per-ad-view / per-ad-click rates, bonus multiplier, currency, min withdrawal,
                live preview of what each member would earn, rate-change history
  Leaderboard   ranked table of all members: visits, points, ads viewed/clicked, hours, earnings, available balance
  Withdrawals   member requests: pending / approve / reject with reason / mark paid, plus company payment methods
  Activity      team activity log and per-member session history (PC name, IP, duration, URLs visited)
```

Every page is mobile-first and uses the existing dark glass design system.

## How URL auto-sync works

Owner saves the URL list → written to `teams.locked_urls` **and** `team_configurations.urls_list` (both, so old and new software builds agree) → members' software picks it up on its next sync/realtime tick. The web panel also subscribes to realtime, so two admins editing see each other's changes immediately.

## Member accounts

Web-created members log into the software with the same email + password they already use: passwords are hashed with the same SHA-256 scheme `team_client.py` uses, done on the server so the raw password never sits in the browser. (Note: SHA-256 without salt is weak; once you're ready we can upgrade both software and web together.)

## Technical notes

- Route files under `src/routes/_authenticated/business.*.tsx` behind a plan gate, plus a `BusinessShell` sidebar mirroring the admin shell.
- All writes go through new server functions (`src/lib/team.functions.ts` / `team.server.ts`) using the existing bearer-auth + service-role pattern from `account.server.ts`, with ownership checks: a caller may only touch teams whose `owner_id` is their user id (site admins may touch any).
- Reads that must be live (leaderboard, members online, PCs, activity) use the browser Supabase client plus realtime subscriptions on `team_members`, `team_leaderboard`, `team_pcs`, `team_activity_logs`.
- No schema changes are planned — your tables already cover this. If a read is blocked by RLS or grants, I'll hand you the exact SQL to run in your Supabase SQL editor rather than guessing.
- Zod validation on every mutation; role rules enforced server-side (one Team Leader per team; leaders can add workers but not leaders).

## Build order

1. Plan gate + shell + Overview
2. Teams + Members (with permissions)
3. URLs + Rules (realtime sync)
4. Earnings config + Leaderboard
5. Withdrawals + company payment methods
6. Activity / sessions / PCs
