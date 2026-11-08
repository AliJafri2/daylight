# MinMax design references

Reference screens downloaded from Mobbin (full resolution). The images are **not committed**
(they belong to Mobbin / the app makers); they're local references only. We use them for
layout, spacing and interaction patterns, never their logos, illustrations or brand colors.

| File | Use it for |
|---|---|
| 01-fuse-home.jpg | **Home**: big number with greyed cents, thin chart, 2x2 tiles, bottom bar |
| 02-fuse-detail-with-chart.jpg | Balance line + legend styling |
| 03-fuse-detail-floating-pill-bar.jpg | Floating pill action bar (Approve all) |
| 04-fuse-quick-action-menu.jpg | Blurred overlay + quick actions |
| 05-fuse-form-big-title-pill-button.jpg | Onboarding steps: big title, full-width pill button |
| 06-fuse-status-toast.jpg | Top status toast ("Moving your bill…") |
| 07-cleo-home.jpg | Card + tab bar alternative |
| 08-cleo-onboarding-ai-explained.jpg | Onboarding "Here's what I do" (bubbles explain the AI) |
| 09-cleo-chat-reply-chips.jpg | Coach chat: tap-to-reply chips |
| 10-cleo-chat-action-in-bubble.jpg | Action button inside an AI bubble |
| 11-cleo-chat-stacked-quick-replies.jpg | Stacked quick replies |

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
