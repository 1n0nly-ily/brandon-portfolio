# Deploying to GitHub Pages

1. Create a new GitHub repo (e.g. `brandon-portfolio`).
2. Add `index.html` to the repo root (rename to `index.html` if it isn't already).
3. Optional: replace `resume.pdf` — drop your actual résumé PDF into the repo root with that exact filename, or update the two `href="resume.pdf"` links in `index.html` to point wherever you host it.
4. In the repo: Settings → Pages → Source → Deploy from branch → `main` / `root`.
5. Your site goes live at `https://<your-username>.github.io/<repo-name>/` within a minute or two.

## Notes
- Single static file, no build step or dependencies beyond Google Fonts (loaded via CDN).
- All animations respect `prefers-reduced-motion`.
- Project links currently point to your existing Wix sub-pages (thesis, kit-plane, Qantas) so visitors can dig into full write-ups — swap these for your own case-study pages whenever you build them out.
