---
updated: 2026-10-24T10:30:00Z
---

Profile photos: uploading gives a new version each time, a friend sees the version and loads the image, a stranger
gets 404, deleting goes back to none; only JPEGs are taken. (Not run in the session that added them: run
`pytest tests/test_photos.py` with MySQL and Valkey up.)

## `test_photo_upload_versions_and_who_sees_it`, `test_photo_must_be_a_jpeg`

As above. `JPEG`: a few bytes that start like one.
