# Checks and limits

On this revision, 37 backend tests passed and two private-recording tests skipped on Python 3.14. The frontend capture checks and production build passed. Chromium checks at 1440 px and 390 px found no page overflow or runtime errors; report navigation, help, and JSON export worked at both sizes. The dependency audit reported no known frontend advisories.

The quick demo includes saved output from Python analysis. Its snapshot is checked by a test. It needs only Python 3 to run.

I tested two phone recordings of a piano. The clean take improved from 40 detections and 8 extras to 32 detections and no extras. The mistaken take improved from 37 detections and 6 extras to 32 detections and 1 extra. Both now show estimated scores. These recordings stay local; they are not included in the repository.

The overlap and onset filters are heuristics. Fast repetitions can merge, quiet attacks can disappear, and resonance can still confuse pitch tracking. Partial takes can align badly. Scores do not measure musical expression.
