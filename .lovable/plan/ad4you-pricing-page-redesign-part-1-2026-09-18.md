# AD4YOU Pricing Page Redesign — Part 1

## Goal
Replace the current pricing page presentation with a premium, responsive SaaS experience while leaving all database, authentication, subscription, expiry, team, and payment-server logic unchanged.

## UI changes
- Rebuild the opening section around the AD4YOU brand, “Choose Your Plan,” the supplied supporting copy, and a polished 30/60/90-day selector.
- Present exactly four paid-plan cards in a responsive grid:
  - Starter: green, 20 PCs, small-team positioning
  - Pro: blue, 50 PCs, growing-team positioning
  - Business: purple, 200 PCs, strongest emphasis and Recommended badge
  - Agency: gold/orange, 1,000 PCs, large-scale positioning
- Give each card its own icon, accent treatment, glow, capacity display, feature list, price transition, and touch-friendly action while keeping consistent sizing and hierarchy.
- Use the specified duration prices and animate the visible amount when the selected duration changes.
- Preserve live discount-offer presentation by applying valid existing offers to the matching plan’s currently displayed price, including original-price strike-through and automatic coupon messaging.
- Add the distinct “Need More PCs?” section with +100, +200, and +300 PC options and the supplied validity note.
- Restyle the existing full feature comparison without removing its live feature data or horizontal mobile scrolling.
- Add the account sign-in prompt and “Start Building Your Team” call to action.
- Add restrained motion with reduced-motion support and ensure no mobile page overflow.

## Existing functionality preserved
- Pricing page availability control.
- Live plan, feature, article, and discount-offer loading.
- Real-time offer and plan refresh behavior.
- Authentication-aware purchase flow and existing crypto checkout.
- Referral discount handling inside checkout.
- Package information/article dialogs.
- Full feature comparison data.
- Existing navigation and footer.

## Technical boundaries
- Change presentation code only, primarily the pricing route plus pricing-specific semantic design tokens/styles.
- Do not alter database tables, SQL, server functions, payment calculation, subscription activation, team access, authentication, or expiry behavior.
- The duration selector is a Part 1 visual representation. Existing checkout remains connected to the stored plan record; any new duration-specific purchase enforcement belongs to Part 2 so the UI cannot weaken server-side price validation.

## Verification
- Check the redesigned page at desktop and mobile widths.
- Verify duration switching, offer display, article dialogs, sign-in/register navigation, comparison scrolling, and checkout opening for authenticated users.
- Confirm the page has no horizontal overflow and respects reduced motion.
