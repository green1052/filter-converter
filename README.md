# filter-converter

Automatically convert filter lists to AdGuard/uBlock formats in your workflows using Node.js and @adguard/extensions.

```yml
name: Convert Filter Lists
on:
  workflow_dispatch:

jobs:
  convert:
    runs-on: ubuntu-latest
    steps:
      - name: Convert
        uses: green1052/filter-converter@v1.0.6
        with:
          paths: |
              - a
              - b
              - c
          out_dir: dist
```