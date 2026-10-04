# Checks and limits

I ran 44 backend tests and 3 browser-capture unit tests. The production frontend build passed. I also checked real uploads, the octave warning, the original-pitch table, and the unreliable-score override in the browser.

The quick demo includes saved output from Python analysis. Its snapshot is checked by a test. It needs only Python 3 to run.

I tested two phone recordings of a piano. The clean take improved from 40 detections and 8 extras to 32 detections and no extras. The mistaken take improved from 37 detections and 6 extras to 32 detections and 1 extra. Both now show estimated scores. These recordings stay local; they are not included in the repository.

The overlap and onset filters are heuristics. Fast repetitions can merge, quiet attacks can disappear, and resonance can still confuse pitch tracking. Partial takes can align badly. Scores do not measure musical expression.

Local and hosted model response handling has mocked tests. Positive responses from a real model and a public deployment still need checks.
