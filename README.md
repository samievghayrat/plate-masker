# Korea Car Post Studio

A private, mobile-friendly tool for preparing Encar and KB Chachacha car posts. Paste a vehicle listing link to:

- download all listing photos quickly;
- optionally detect and cover Korean license plates;
- optionally add a custom watermark;
- generate an editable Russian sales post;
- switch between the Korean price and a turnkey Vladivostok price;
- save selected photos through the phone share sheet or download a ZIP;
- manually cover any plate the detector misses.

The generated post never includes the license plate number. VIN is excluded by default and can be enabled for an individual post.

## Run locally

```bash
npm ci
npm start
```

Open <http://localhost:3100>. The first install downloads the ONNX license-plate detector into `models/`.

## Tests

```bash
npm test
```

## Notes

- Encar photos and vehicle details come from Encar's public read-side endpoints.
- KB Chachacha photos and vehicle details are read from the public vehicle-detail page.
- Direct gallery saving depends on the mobile browser's share-sheet support. When it is unavailable, the app downloads a ZIP.
- Generated text is template-based and does not require an OpenAI API key.
