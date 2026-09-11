# Complete multiple software downloads manager

## Admin manager
- Rename the admin section to “Software Downloads” and add a prominent “Add New Download Option” action.
- Replace the prompt-based creation flow with a proper form for title, platform, version, URL, description, file size, visibility, and display order.
- Show every saved option as a separate editable item with explicit Edit, Save, Cancel, and Delete actions.
- Preserve every existing row; creating a new option always inserts a new record.

## Public downloads
- Continue showing the legacy download setting when no saved version has a URL.
- Show all active download records in display order and refresh the public page immediately after database changes.
- Present each option’s title, platform, version, description, and file size clearly.

## Database SQL
- Provide one idempotent copy-paste SQL script that adds the required fields, backfills existing rows, grants public reads and authenticated admin writes, enables row-level security, adds indexes, and safely enables realtime.
- Preserve the existing `bot_versions` table and data; no destructive schema changes or sample records.

## Validation
- Verify the admin create/edit/delete interface and the public multiple-download display on desktop and mobile.
- Confirm the project checks pass and the legacy fallback remains intact.

## Technical details
- Use the existing `bot_versions` table and `is_admin(auth.uid())` authorization helper.
- Keep the old `settings.download_url` fallback only when no active version record has a usable URL.
