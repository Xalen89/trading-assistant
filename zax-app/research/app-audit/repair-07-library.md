# Private Library and upload repair

The mounted and legacy scan paths now use durable source-analysis jobs with duplicate-source guards rather than synchronous model calls. Compatible image jobs include nonfatal visual indexing; originals and analysis survive index failures. Cancellation uses owner-scoped compare-and-swap and cancel-safe result persistence, so a started model call may finish but cannot save after successful cancellation.

Binary intake validates bounded decoding before retention. The installed local OpenCV decoder checks supported raster files with pixel limits; pdfinfo parses PDF page counts under a bound. Header-only/corrupt sources fail before storage. Photo search is consistently limited to 8 MiB before picker read and RPC transport.

A typed notes-backed purpose marker keeps trade screenshots review-only. These sources are excluded from generic extraction/indexing, keyword/visual matching, blueprint analysis, reindexing and promotion. Unknown purpose markers fail closed. The legacy full-original source procedure was removed; client source/workspace/version DTOs omit fileKey while protected preview and server revisions retain storage keys.

The original read-only finding that there was no deletion path was corrected by implementation inspection: the owner-confirmed workspace-tools deletion/reclaim path already exists. A scoped follow-up adds transactionally tracked pending cleanup for retained protected originals when the storage provider has no deletion method. Logical capacity reclamation is not falsely called physical object deletion.

The worker's focused mocked/pure run passed 42 tests across eight files. Final integrated diagnostics/results are recorded in the report header. No actual upload, deletion, model, storage, database, device, push or deployment operation was performed; the local image/PDF worker dependencies remain deployment requirements.
