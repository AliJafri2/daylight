# MinMax design references

Reference screens downloaded from Mobbin (full resolution). The images are **not committed**
(they belong to Mobbin / the app makers); they're local references only. We use them for
layout, spacing and interaction patterns, never their logos, illustrations or brand colors.

| File | Use it for | screenshot-to-code? |
|---|---|---|
| 08-fuse-welcome.jpg | **Title screen**: word "wheel" (Gas · Groceries · Bills · Savings), gradient, Get started + subtle Log in | ✅ credit 1 |
| 09-fuse-email-signup.jpg | **Create account**: big title, rounded input, pill button | built by eye |
| 10-cleo-ai-onboarding.jpg | (skipped: "Here's what I do" built from 08 + 15) | — |
| 01-fuse-home.jpg | **Home**: big number with greyed cents, thin chart, 2x2 tiles | ✅ credit 3 |
| 11-bevel-ai-chat-thinking-steps.jpg | **Plan**: "Thought for Xs" step list, result card, frosted input | built by eye |
| 15-bevel-ai-greeting.jpg | **Coach** (chosen): pastel glow, mascot, "Here for you, Bill.", suggestion cards, frosted input | ✅ credit 3 |
| 16-wabi-plan-progress-card.jpg | Plan card with step checklist filling in | built by eye |
| 17-cleo-ai-chat-backup.jpg | Backup chat style (Cleo AI) | built by eye |
| 12-perplexity-agent-card.jpg | **Plan**: "running tasks" + interactive card with Skip/Continue | optional credit 5, else by eye |
| 13-cleo-ai-voice-orb.jpg | **Voice coach** (Vapi): glowing orb, "Talking to…" | built by eye |
| 14-wabi-rich-card-in-chat.jpg | Result card inside chat ("Plan ready · Review") | built by eye |
| 02-fuse-detail-with-chart.jpg | Balance line + legend | built by eye |
| 03-fuse-detail-floating-pill-bar.jpg | Floating "Approve all" bar; Accounts list | built by eye |
| 04-fuse-quick-action-menu.jpg | Blurred overlay + quick actions | built by eye |
| 05-fuse-form-big-title-pill-button.jpg | Onboarding step layout | built by eye |
| 06-fuse-status-toast.jpg | Top status toast | built by eye |
| 07-cleo-ai-home.jpg | Cleo AI's warm card + tab styling | built by eye |

## Using screenshot-to-code (screenshottocode.com): 4 runs, one image each

Do these one at a time (one image per run; several at once blends them together):

| Run | Upload | Save the result as |
|---|---|---|
| 1 ✅ | `08-fuse-welcome.jpg` | `08-fuse-welcome.html` |
| 2 ✅ | `01-fuse-home.jpg` | `01-fuse-home.html` |
| 3 | `15-bevel-ai-greeting.jpg` | `15-bevel-ai-greeting.html` |
| 4 (optional) | `12-perplexity-agent-card.jpg` | `12-perplexity-agent-card.html` |

For every run:
- Output stack: **HTML + CSS** (React + Tailwind is OK if HTML + CSS isn't offered).
- Paste this instruction:

  > Recreate this mobile screen's layout at 390px wide with exact spacing, font sizes, font weights,
  > corner radii, shadows and colors. Put every color, font size, radius, spacing and shadow value in
  > CSS custom properties at the top. Use plain text placeholders instead of logos, photos or
  > illustrations. Don't add anything that isn't in the screenshot.

- Save the result into this folder with the name above, then tell Claude "done".
Claude extracts the measurements and builds MinMax's own screens with them.
