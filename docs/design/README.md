# MinMax design references

Reference screens downloaded from Mobbin (full resolution). The images are **not committed**
(they belong to Mobbin / the app makers); they're local references only. We use them for
layout, spacing and interaction patterns, never their logos, illustrations or brand colors.

| File | Use it for | screenshot-to-code? |
|---|---|---|
| 08-fuse-welcome.jpg | **Title screen**: word "wheel" (Gas · Groceries · Bills · Savings), gradient, Get started + subtle Log in | ✅ credit 1 |
| 09-fuse-email-signup.jpg | **Create account**: big title, rounded input, pill button | built by eye |
| 10-cleo-ai-onboarding.jpg | **"Here's what I do"**: AI explains itself (save from Cleo AI, not Cleo) | ✅ credit 2 |
| 01-fuse-home.jpg | **Home**: big number with greyed cents, thin chart, 2x2 tiles | ✅ credit 3 |
| 11-cleo-ai-chat.jpg | **Coach + Plan**: AI bubbles, reply chips (save from Cleo AI, not Cleo) | ✅ credit 4 |
| 02-fuse-detail-with-chart.jpg | Balance line + legend | built by eye |
| 03-fuse-detail-floating-pill-bar.jpg | Floating "Approve all" bar; Accounts list | built by eye |
| 04-fuse-quick-action-menu.jpg | Blurred overlay + quick actions | built by eye |
| 05-fuse-form-big-title-pill-button.jpg | Onboarding step layout | built by eye |
| 06-fuse-status-toast.jpg | Top status toast | built by eye |
| 07-cleo-ai-home.jpg | Cleo AI's warm card + tab styling | built by eye |

## Using screenshot-to-code (screenshottocode.com)

1. Upload **one** image at a time (start with 01, 08, 09).
2. Output stack: **HTML + CSS** (our app uses plain CSS). React + Tailwind is OK if HTML + CSS isn't offered.
3. Paste this as the extra instruction:

   > Recreate this mobile screen's layout at 390px wide with exact spacing, font sizes, font weights,
   > corner radii, shadows and colors. Put every color, font size, radius, spacing and shadow value in
   > CSS custom properties at the top. Use plain text placeholders instead of logos, photos or
   > illustrations. Don't add anything that isn't in the screenshot.

4. Save each result here as `NN-name.html` (e.g. `01-fuse-home.html`) and tell Claude.
   Claude extracts the measurements and builds MinMax's own screens with them.
