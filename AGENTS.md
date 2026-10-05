<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Treat the `demo` plan slug as full feature access but admin-assigned only; keep it out of public pricing and checkout so its zero price cannot be purchased.
- Manual payments live in their own tables (manual_payments etc.) and activate subscriptions only through the approve_manual_payment SQL function; prices and exchange rates are always recalculated server-side and frozen at submission. Why: keeps NOWPayments untouched and prevents price tampering or double activation.
