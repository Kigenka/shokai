# site-dist fixture (case 30)

A tiny, self-contained stand-in for the built `/business` page, used by case 30
(`30-business-form-inert`). It is a single file, `business.html`, with no external
requests (inline CSS, no script, `data:` favicon).

What the case needs from it:

- the same form markup as the site: `.bl-notify` > `.bl-form` with three text inputs
  (`#bl-name`, `#bl-email`, `#bl-store`) and one `<button>`, all `disabled`;
- no `<form>` element and no `action` / `formaction` attributes;
- no sub-resource requests after load (the case counts every request once the page is quiet);
- the page title (`Shōkai for shops (coming soon) · Shōkai`).

## Regenerating

1. Build the site (VitePress) and open `business.html` from the build output.
2. Copy the rendered `<section class="bl-notify">…</section>` markup verbatim into
   `business.html` here, replacing the existing section.
3. Keep the inline `<style>` minimal (form layout only) and make sure nothing
   references an external file (no stylesheets, scripts, icons or manifests).
4. Keep the whole directory under 30 KB.

## Testing against a full build

Set `SHOKAI_SITE_DIST` to the build output directory (the one that contains
`business.html`) and the case will serve that instead of this fixture:

    SHOKAI_SITE_DIST=/path/to/site/.vitepress/dist

The case's expectations apply equally to the full build.
