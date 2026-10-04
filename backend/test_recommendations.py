from recommendations import rules


def bar(number, wrong=0, missed=0, early=0, late=0, extra=0):
    return dict(number=number, total=8, wrong=wrong, missed=missed, early=early,
                late=late, extra=extra, mistakes=wrong+missed+early+late+extra)


def test_suggestions_follow_dominant_error():
    report = dict(assessment_limited=False, sections=[
        bar(1, wrong=4, missed=1), bar(2, missed=3, late=1), bar(3, early=2)])
    result = {r["measures"][0]: r for r in rules(report)}
    assert "score" in result[1]["body"] and "Slow down" in result[1]["body"]
    assert "skipped note" in result[2]["body"] and "transition" in result[2]["body"]
    assert "metronome" in result[3]["body"] and "70%" in result[3]["body"]


def test_singular_and_plural_reasons():
    result = rules(dict(assessment_limited=False, sections=[
        bar(1, wrong=1, missed=1, extra=1, early=1, late=2)]))
    assert result[0]["reason"] == "1 wrong pitch, 1 missed note, 1 extra note, 1 early note, 2 late notes."


def test_same_error_bars_get_different_drills():
    result = rules(dict(assessment_limited=False, sections=[bar(i, late=2) for i in range(1,6)]))
    assert len({r["title"].split(": ")[1] for r in result}) == 5
    assert len({r["body"] for r in result}) == 5
    assert all("metronome" in r["body"] for r in result)


def test_short_passage_has_distinct_steps():
    result = rules(dict(assessment_limited=False, sections=[bar(1, missed=1)]))
    assert len(result) == 3
    assert len({r["title"] for r in result}) == 3
    assert len({r["body"] for r in result}) == 3
