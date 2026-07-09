# Third-Party Notices

This project bundles third-party fonts. The full text of each license is included
next to the font files under `public/assets/fonts/`.

## Roboto (Regular)

- Copyright 2015 Google Inc. All Rights Reserved.
- License: Apache License, Version 2.0 — see
  [`public/assets/fonts/Roboto-Apache-2.0.txt`](./public/assets/fonts/Roboto-Apache-2.0.txt)
- "Roboto is a trademark of Google."
- Source: https://fonts.google.com/specimen/Roboto

## Noto Sans JP (Regular) — subset

- Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'.
- Part of the Google Noto fonts, derived from Adobe Source Han Sans.
- License: SIL Open Font License, Version 1.1 — see
  [`public/assets/fonts/NotoSansJP-OFL.txt`](./public/assets/fonts/NotoSansJP-OFL.txt)
- The bundled `NotoSansJP-Regular.ttf` is a **modified subset** of the original:
  the variable font was instanced to the Regular (weight 400) instance and reduced
  to the cp932 / Shift-JIS character repertoire using `fontTools`, to keep the
  asset small. The subset remains licensed under the SIL OFL 1.1.
- Source: https://fonts.google.com/noto/specimen/Noto+Sans+JP
