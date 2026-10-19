# Open Reader

A free, ad-free document reader that runs entirely in your browser. Open a file, read it, done. Nothing is uploaded, tracked or stored.

It is plain HTML, CSS and JavaScript. There is no server, no build step and nothing to install, so it works on any phone or computer with a modern browser.

## Supported formats

| Type | Extensions | What you get |
|---|---|---|
| PDF | `.pdf` | Full page rendering with zoom |
| Word | `.docx`, `.doc` | Text and formatting for `.docx`; plain text for old `.doc` |
| Excel | `.xlsx`, `.xls`, `.xlsm`, `.ods`, `.csv`, `.tsv` | Tables, one tab per sheet |
| PowerPoint | `.pptx`, `.ppt` | Slide titles, text, tables and pictures (`.pptx`); titles and text (`.ppt`) |
| Books | `.epub` | Chapter text |
| Text and code | `.txt`, `.md`, `.json`, `.html`, `.xml`, and most source files | Readable text, Markdown and JSON formatted |
| Images | `.png`, `.jpg`, `.gif`, `.webp`, `.svg`, `.bmp` | Image viewer |

## Project structure

```
open-reader/
├── index.html      Page layout and library imports
├── css/
│   └── style.css   Styling, light and dark themes
├── js/
│   ├── app.js      File picker, format routing, and readers for PDF, DOCX, XLSX, PPTX, EPUB, text
│   └── legacy.js   Parser for old .doc and .ppt files (OLE2 container)
└── README.md
```

## How it works

`app.js` looks at the file extension and sends the file to the right reader:

| Format | Library |
|---|---|
| PDF | [pdf.js](https://mozilla.github.io/pdf.js/) |
| DOCX | [mammoth.js](https://github.com/mwilliamson/mammoth.js) |
| XLSX / CSV | [SheetJS](https://sheetjs.com/) |
| PPTX, EPUB | [JSZip](https://stuk.github.io/jszip/) (both are zip files of XML) |
| Markdown | [marked](https://marked.js.org/) |
| DOC, PPT | `js/legacy.js` (written for this project, no library) |

The libraries load from cdnjs, so the first visit needs an internet connection.

## Run it locally

Open `index.html` in a browser. If a browser blocks anything, serve the folder instead:

```bash
python -m http.server 8000
```

then visit `http://localhost:8000`.

## Put it online with GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repository, go to **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
4. After a minute your site is live at `https://<your-username>.github.io/<repository-name>/`.

## Install it on your phone

Open your site's link on your phone, then:

- **Android (Chrome):** menu (three dots) > **Add to Home screen**
- **iPhone (Safari):** Share button > **Add to Home Screen**

It now opens from your home screen like an app.

## Known limits

- `.doc` files show text only. Formatting, images and the text of headers, footnotes and text boxes are not shown. Password-protected files can't be opened.
- `.ppt` files show slide titles and text only, no images or layout.
- `.pptx` files do not reproduce the slide design. Charts, SVG and EMF images are skipped.
- EPUB shows text without images.
- Very large files can be slow on older phones.

## Adding a format

1. Write an `openXyz(file)` function in `js/app.js` that builds HTML and passes it to `show()`.
2. Add a line in `openFile()` that sends the right extension to it.
3. If it needs a library, add a `<script>` tag for it in `index.html`.
