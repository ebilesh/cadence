"""Accuracy regressions for rolled voices, omissions and duplicates."""
from analysis import analyze, onset_groups


def passage():
    return [dict(pitch=p, start=float(t), duration=.4)
            for t, pitches in enumerate([[60, 64, 67], [62, 65, 69], [59, 62, 67], [60, 64, 72]])
            for p in pitches]


def test_rolled_chords_ignore_voice_attack_order():
    reference = passage()
    played = [dict(n, start=n['start'] * 1.2 + 1 + (.04 if i % 3 == 0 else .02 if i % 3 == 1 else 0))
              for i, n in enumerate(reference)]
    report = analyze(reference, played)
    assert report['pitch_score'] == 100
    assert report['counts']['missed'] == report['counts']['extra'] == report['counts']['wrong'] == 0
    assert report['timing_score'] >= 88
    assert all(n['pitch'] == n['played'] for n in report['notes'])


def test_missing_and_extra_chord_tones_are_counted_once():
    reference = passage()
    played = [dict(n) for i, n in enumerate(reference) if i != 4]
    played.append(dict(pitch=80, start=2.02, duration=.4))
    report = analyze(reference, played)
    assert report['counts']['missed'] == 1
    assert report['counts']['extra'] == 1
    assert report['counts']['wrong'] == 0


def test_wrong_chord_tone_is_not_two_gaps():
    reference = passage()
    played = [dict(n) for n in reference]
    played[4]['pitch'] += 1
    report = analyze(reference, played)
    assert report['counts']['wrong'] == 1
    assert report['counts']['missed'] == report['counts']['extra'] == 0


def test_grouping_does_not_chain_nearby_attacks():
    notes = [dict(pitch=60, start=t, duration=.1) for t in [0, .04, .08]]
    assert onset_groups(notes) == [[0, 1], [2]]


def test_duplicate_voices_remain_one_to_one():
    reference = passage() + [dict(pitch=60, start=0., duration=.4)]
    report = analyze(reference, passage())
    assert report['counts']['missed'] == 1
    assert len({n['index'] for n in report['notes']}) == len(reference)
