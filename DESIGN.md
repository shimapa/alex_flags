# Football scarves — design record

Interface language adapted from KolleK (MIT, see CREDITS.md): a neutral collection manager, not a themed
fan page. The scarves' own colours are the only saturated thing on screen.

## Tokens (css/app.css)
- Surfaces: page `#fff`, sidebar `#f8f9fa`, card `#f5f5f5`, hairline `#e5e7eb`; dark: `#101010` / `#161616` / `#1e1e1e` / `#2a2a2a`.
- Text: ink `#111`, body `#374151`, muted `#6b7280`, muted-soft `#898989`; primary button = ink, inverts in dark.
- Radii 8 / 12 / 16px. Inter 400–700. Title 28px/600, tracking -0.025em.
- Data: single brand blue `#2a78d6` (dark `#3987e5`); map uses a 6-step blue ramp stepped separately for dark.
- Status-like badges: New (red tint), Official (amber tint), National team (blue tint).

## Structure
- Left sidebar: brand + theme toggle, Items / Map / Statistics, every country as a category with flag chip and count, owner block.
- Items: breadcrumb, collection header (icon tile, title + badge, lede, KPI row), continent pill group, search, grid/list switch,
  arrival select + Official / National teams / New chips, sort. Cards: grey photo well with the scarf contained, badge + name, arrival badge, country + year.
- Scarf: badge tile + title, photo well with gentle tilt/glare on hover, collector's note, details list, more from the country, ←/→/Esc.
- Statistics: four KPI cards, year column chart, arrival bars, top countries, continents; every chart has a table twin.
- Map: choropleth (Europe / World), tooltips, click to filter, ranked list beside it.

## Motion
Only hover transitions, bar growth on first view, map zoom between Europe and World, and the photo tilt. No ambient animation.
